/** Development BFF: remote reads, explicit local evidence and workflow writes. */
import { randomBytes, randomUUID } from 'node:crypto';
import { streamSensorEvents } from './sensor-events.mjs';
import { Readable } from 'node:stream';
import { normalizeApiUrl } from 'cyberwave';
const ttl = 60 * 60 * 1000;
const allowed = /^\/api\/v1\/(assets(?:\/[a-zA-Z0-9-]+)?|environments(?:\/[a-zA-Z0-9-]+(?:\/(?:twins|waypoints|recordings(?:\/[a-zA-Z0-9_-]+\/data)?))?)?|twins\/[a-zA-Z0-9-]+\/missions(?:\/[a-zA-Z0-9-]+(?:\/executions)?)?)$/;
const twinRead = /^\/api\/v1\/twins\/[a-zA-Z0-9-]+(?:\/telemetry)?$/;
const videoViewer = /^\/api\/v1\/twins\/[a-zA-Z0-9-]+\/video-sessions(?:\/[a-zA-Z0-9_-]+\/close)?$/;
const collectionRead = /^\/api\/v1\/environments\/[a-zA-Z0-9-]+\/(?:missions|evidence-collections(?:\/[a-zA-Z0-9-]+)?|evidence-subjects\/[a-zA-Z0-9-]+\/records)$/;
const collectionWrite = /^\/api\/v1\/environments\/[a-zA-Z0-9-]+\/(?:evidence-collections|evidence-records\/[a-zA-Z0-9-]+\/reviews)$/;
const governanceRead = /^\/api\/v1\/workspaces\/[a-zA-Z0-9-]+\/missions$/;
const workflowCommand = /^\/api\/v1\/workflows\/(?:[a-zA-Z0-9-]+\/(?:clone|activate|deactivate|execute)|executions\/[a-zA-Z0-9-]+\/cancel)$/;
const workflowEdit = /^\/api\/v1\/workflows\/[a-zA-Z0-9-]+(?:\/nodes\/[a-zA-Z0-9-]+)?$/;
const workflowRead = /^\/api\/v1\/workflows(?:\/[a-zA-Z0-9-]+(?:\/(?:input-contract|executions(?:\/[a-zA-Z0-9-]+)?))?)?$/;
const modelRead = /^\/api\/v1\/mlmodels(?:\/(?:structured-actions|executions\/[a-zA-Z0-9-]+|[a-zA-Z0-9-]+))?$/;
const modelRun = /^\/api\/v1\/mlmodels\/[a-zA-Z0-9-]+\/run$/;
const evidenceRead = /^\/api\/v1\/(?:workflow-actions(?:\/[a-zA-Z0-9-]+)?|datasets(?:\/[a-zA-Z0-9-]+(?:\/samples)?)?)$/;
const evidenceWrite = /^\/api\/v1\/(?:workflow-actions\/[a-zA-Z0-9-]+\/respond|datasets\/(?:collections|[a-zA-Z0-9-]+\/samples(?:\/[a-zA-Z0-9-]+\/review)?))$/;
export function createConnectionGateway(settings = {}, transport = fetch) {
  const { localToken, localOrigin = 'http://localhost:8000' } = settings;
  const sessions = new Map();
  function registerResources(data, session) {
    if (Array.isArray(data)) return data.forEach(row => registerResources(row, session));
    if (!data || typeof data !== 'object') return;
    for (const key of ['urdf_file', 'glb_file', 'thumbnail']) {
      if (typeof data[key] !== 'string' || !data[key]) continue;
      let url;
      try { url = new URL(data[key], session.origin); } catch { continue; }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
      session.files.add(url.href);
      const project = url.href.match(/^(.*\/urdf_projects\/[^/]+\/)/)?.[1];
      if (project) session.roots.add(project);
    }
    // Media references from typed human-action/sample envelopes only; do not
    // recurse arbitrary workflow metadata into the storage allowlist.
    if (Array.isArray(data.items)) data.items.forEach(row => registerResources(row, session));
    if ((typeof data.source_sha256 === 'string' || typeof data.workflow_name === 'string') && typeof data.file_url === 'string') {
      try { const url = new URL(data.file_url); if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) session.files.add(url.href); } catch {}
    }
    // Playback envelopes: register exact signed camera URLs, never arbitrary metadata URLs.
    for (const entry of Object.values(data.items?.twin_data || {})) {
      const raw = entry?.camera?.signed_url;
      if (typeof raw !== 'string') continue;
      try { const url = new URL(raw); if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) session.files.add(url.href); } catch {}
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
      if (sessions.size >= 100 && !session) { send(429, { detail: 'Too many active sessions' }); return true; }
      if (id) sessions.delete(id);
      const nextId = randomBytes(24).toString('hex');
      const scopedToken = token || (origin === localOrigin ? localToken : undefined);
      session = { connectionId: randomUUID(), origin, token: scopedToken, files: new Set(), roots: new Set(), expires: Date.now() + ttl };
      sessions.set(nextId, session);
      res.setHeader('Set-Cookie', `cyberwave_example=${nextId}; HttpOnly; SameSite=Strict; Path=/gateway; Max-Age=3600`);
      send(200, { connectionId: session.connectionId, baseUrl: origin, authenticated: !!scopedToken }); return true;
    }
    if (url.pathname === '/gateway/connection' && req.method === 'DELETE') {
      sessions.delete(id); res.setHeader('Set-Cookie', 'cyberwave_example=; HttpOnly; SameSite=Strict; Path=/gateway; Max-Age=0'); send(200, { disconnected: true }); return true;
    }
    if (!session) { send(401, { detail: 'Connect to an API first. Session may have expired.' }); return true; }
    if (url.pathname === '/gateway/connection' && req.method === 'GET') { send(200, { connectionId: session.connectionId, baseUrl: session.origin, authenticated: !!session.token }); return true; }
    if (url.pathname === '/gateway/sensor-events' && req.method === 'GET') {
      if (req.headers['x-cyberwave-connection'] !== session.connectionId) { send(409, { detail: 'API connection changed.' }); return true; }
      await streamSensorEvents(req, res, url, session, () => sessions.get(id) === session && session.expires > Date.now(), { ...settings, localOrigin }, transport);
      return true;
    }
    if (url.pathname.startsWith('/gateway/rest/')) {
      // The cookie is shared by tabs. A stale client must never silently adopt a
      // different origin or account after another tab reconnects. This ID is a
      // revision, not a credential: the HttpOnly cookie still authenticates it.
      if (req.headers['x-cyberwave-connection'] !== session.connectionId) {
        send(409, { detail: 'The API connection changed in another tab. Reconnect or reload this example.' }); return true;
      }
      const path = url.pathname.slice('/gateway/rest'.length);
      let body;
      if (req.method !== 'GET') {
        const local = ['localhost','127.0.0.1','[::1]'].includes(new URL(session.origin).hostname);
        const permitted =
          (req.method === 'POST' && (collectionWrite.test(path) || workflowCommand.test(path) || evidenceWrite.test(path) || modelRun.test(path) || videoViewer.test(path))) ||
          (req.method === 'PUT' && workflowEdit.test(path));
        if (!permitted || !local || !session.token) { send(405, { detail: 'Only authenticated local example writes are enabled.' }); return true; }
        const bodyLimit = modelRun.test(path) ? 28*1024*1024 : 1024*1024;
        body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > bodyLimit) { send(413,{detail:'Request body too large'}); return true; } }
        if (body) JSON.parse(body); else body = undefined;
      } else if (!allowed.test(path) && !twinRead.test(path) && !collectionRead.test(path) && !governanceRead.test(path) && !workflowRead.test(path) && !evidenceRead.test(path) && !modelRead.test(path)) { send(403, { detail: 'Unsupported read operation' }); return true; }
      const upstream = await transport(new URL(path + url.search, session.origin), { method:req.method, body, redirect: 'error', signal: AbortSignal.timeout(modelRun.test(path) ? 120000 : 20000), headers: { ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}), ...(body ? {'Content-Type':'application/json'} : {}) } });
      if (!upstream.ok) {
        const error = await upstream.json().catch(() => ({}));
        const detail = typeof error.detail === 'string' ? error.detail.slice(0, 2000) : `Cyberwave returned ${upstream.status}`;
        send(upstream.status, { detail }); return true;
      }
      const data = await upstream.json(); registerResources(data, session); send(upstream.status, data); return true;
    }
    if (req.method !== 'GET') { send(405, { detail: 'This resource is read-only.' }); return true; }
    if (url.pathname === '/gateway/media') {
      const resource = new URL(url.searchParams.get('url'));
      if (!session.files.has(resource.href) && ![...session.roots].some(root => resource.href.startsWith(root))) {
        send(403, { detail: 'Resource was not returned by this connection.' }); return true;
      }
      // Never forward an API token to storage/CDN URLs, even when on the API origin.
      const range = req.headers.range;
      if (range && !/^bytes=\d*-\d*$/.test(range)) { send(400, { detail: 'Only a single byte range is supported' }); return true; }
      const upstream = await transport(resource, { redirect: 'error', signal: AbortSignal.timeout(60000), ...(range ? { headers: { Range: range } } : {}) });
      if (!upstream.ok || !upstream.body) { send(upstream.status, { detail: 'Model resource unavailable' }); return true; }
      const headers = { 'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
      for (const name of ['content-range', 'accept-ranges', 'content-length']) if (upstream.headers.has(name)) headers[name] = upstream.headers.get(name);
      res.writeHead(upstream.status, headers);
      const stream = Readable.fromWeb(upstream.body); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res); return true;
    }
    send(404, { detail: 'Unknown gateway route' }); return true;
  };
}
