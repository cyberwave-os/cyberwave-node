/** Read-only development BFF. Sessions and tokens expire in memory; never log credentials. */
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { normalizeApiUrl } from 'cyberwave';
const ttl = 60 * 60 * 1000;
const allowed = /^\/api\/v1\/(assets(?:\/[a-zA-Z0-9-]+)?|environments(?:\/[a-zA-Z0-9-]+(?:\/(?:twins|waypoints))?)?)$/;
export function createConnectionGateway({ localToken, localOrigin = 'http://localhost:8000' } = {}, transport = fetch) {
  const sessions = new Map();
  function registerResources(data, session) {
    if (Array.isArray(data)) return data.forEach(row => registerResources(row, session));
    if (!data || typeof data !== 'object') return;
    for (const key of ['urdf_file', 'glb_file', 'thumbnail']) {
      if (typeof data[key] !== 'string' || !data[key]) continue;
      const url = new URL(data[key], session.origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
      session.files.add(url.href);
      const project = url.href.match(/^(.*\/urdf_projects\/[^/]+\/)/)?.[1];
      if (project) session.roots.add(project);
    }
  }
  return async function handle(req, res, url, send) {
    if (!url.pathname.startsWith('/gateway/')) return false;
    for (const [id, session] of sessions) if (session.expires < Date.now()) sessions.delete(id);
    const id = (req.headers.cookie || '').match(/(?:^|;\s*)cyberwave_example=([a-f0-9]{48})/)?.[1];
    let session = sessions.get(id);
    if (url.pathname === '/gateway/connection' && req.method === 'POST') {
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 8192) { send(413, { detail: 'Connection request too large' }); return true; } }
      const input = JSON.parse(body), origin = normalizeApiUrl(input.baseUrl);
      const token = typeof input.token === 'string' ? input.token.trim() : '';
      if (/[\r\n]/.test(token)) { send(400, { detail: 'Invalid token' }); return true; }
      if (sessions.size >= 100) { send(429, { detail: 'Too many active sessions' }); return true; }
      if (id) sessions.delete(id);
      const nextId = randomBytes(24).toString('hex');
      const scopedToken = token || (origin === localOrigin ? localToken : undefined);
      session = { origin, token: scopedToken, files: new Set(), roots: new Set(), expires: Date.now() + ttl };
      sessions.set(nextId, session);
      res.setHeader('Set-Cookie', `cyberwave_example=${nextId}; HttpOnly; SameSite=Strict; Path=/gateway; Max-Age=3600`);
      send(200, { baseUrl: origin, authenticated: !!scopedToken }); return true;
    }
    if (url.pathname === '/gateway/connection' && req.method === 'DELETE') {
      sessions.delete(id); res.setHeader('Set-Cookie', 'cyberwave_example=; HttpOnly; SameSite=Strict; Path=/gateway; Max-Age=0'); send(200, { disconnected: true }); return true;
    }
    if (!session) { send(401, { detail: 'Connect to an API first. Session may have expired.' }); return true; }
    if (url.pathname === '/gateway/connection' && req.method === 'GET') { send(200, { baseUrl: session.origin, authenticated: !!session.token }); return true; }
    if (req.method !== 'GET') { send(405, { detail: 'This connection is read-only.' }); return true; }
    if (url.pathname.startsWith('/gateway/rest/')) {
      const path = url.pathname.slice('/gateway/rest'.length);
      if (!allowed.test(path)) { send(403, { detail: 'Unsupported read operation' }); return true; }
      const upstream = await transport(new URL(path + url.search, session.origin), { redirect: 'error', signal: AbortSignal.timeout(20000), headers: session.token ? { Authorization: `Bearer ${session.token}` } : {} });
      if (!upstream.ok) { send(upstream.status, { detail: `Cyberwave returned ${upstream.status}` }); return true; }
      const data = await upstream.json(); registerResources(data, session); send(200, data); return true;
    }
    if (url.pathname === '/gateway/media') {
      const resource = new URL(url.searchParams.get('url'));
      if (!session.files.has(resource.href) && ![...session.roots].some(root => resource.href.startsWith(root))) {
        send(403, { detail: 'Resource was not returned by this connection.' }); return true;
      }
      // Never forward an API token to storage/CDN URLs, even when on the API origin.
      const upstream = await transport(resource, { redirect: 'error', signal: AbortSignal.timeout(60000) });
      if (!upstream.ok || !upstream.body) { send(upstream.status, { detail: 'Model resource unavailable' }); return true; }
      res.writeHead(200, { 'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      const stream = Readable.fromWeb(upstream.body); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res); return true;
    }
    send(404, { detail: 'Unknown gateway route' }); return true;
  };
}
