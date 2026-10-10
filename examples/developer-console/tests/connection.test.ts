import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from '../server.mjs';
const settings = { mode: 'fixture', apiUrl: 'http://localhost:8000', token: 'local-only-secret', anchor: { longitude: 0, latitude: 0, height: 0, yawDegrees: 0 } };
async function run(upstream, callback) {
  const server = createGateway(settings, upstream); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`; let cookie = '';
  const request = async (path, method = 'GET', body, origin = 'http://127.0.0.1:5173') => {
    const result = await fetch(base + path, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (result.headers.get('set-cookie')) cookie = result.headers.get('set-cookie').split(';')[0]; return result;
  };
  try { await callback(request); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
test('production is read-only and does not inherit the local token', async () => {
  const calls = [];
  await run(async (url, opts) => { calls.push({ url: String(url), opts }); return Response.json([]); }, async request => {
    const connection = await request('/gateway/connection', 'POST', { baseUrl: 'https://api.cyberwave.com' });
    assert.equal((await connection.json()).authenticated, false);
    assert.match(connection.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    assert.equal((await request('/gateway/rest/api/v1/assets?limit=12')).status, 200);
    assert.equal((await request('/gateway/rest/api/v1/assets', 'POST', {})).status, 405);
    assert.equal((await request('/gateway/rest/api/v1/twins/robot/navigation')).status, 403);
    assert.equal(calls.length, 1); assert.equal(calls[0].opts.headers.Authorization, undefined);
  });
});
test('reconnect invalidates the previous session and disconnect revokes it', async () => {
  const auth = [];
  await run(async (url, opts) => { auth.push(opts.headers.Authorization); return Response.json([]); }, async request => {
    await request('/gateway/connection', 'POST', { baseUrl: 'http://localhost:8000' });
    await request('/gateway/rest/api/v1/environments');
    await request('/gateway/connection', 'POST', { baseUrl: 'https://custom.example.com', token: 'custom-secret' });
    await request('/gateway/rest/api/v1/environments');
    await request('/gateway/connection', 'DELETE');
    assert.equal((await request('/gateway/rest/api/v1/environments')).status, 401);
    assert.deepEqual(auth, ['Bearer local-only-secret', 'Bearer custom-secret']);
  });
});
test('only discovered model resources can load and storage receives no API token', async () => {
  const calls = [];
  await run(async (url, opts) => {
    calls.push({ url: String(url), opts });
    return String(url).includes('/api/v1/assets') ? Response.json([{ urdf_file: 'https://static.cyberwave.com/media/urdf_projects/robot/urdf/robot.urdf' }]) : new Response('mesh');
  }, async request => {
    await request('/gateway/connection', 'POST', { baseUrl: 'https://api.cyberwave.com', token: 'production-test-token' });
    assert.equal((await request('/gateway/media?url=https%3A%2F%2Funrelated.example.com%2Ffile')).status, 403);
    await request('/gateway/rest/api/v1/assets');
    const model = 'https://static.cyberwave.com/media/urdf_projects/robot/dae/base.dae';
    const result = await request('/gateway/media?url=' + encodeURIComponent(model)); assert.equal(await result.text(), 'mesh');
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer production-test-token');
    assert.equal(calls[1].opts.headers, undefined); assert.equal(calls[1].opts.redirect, 'error');
    assert.equal((await request('/gateway/media?url=' + encodeURIComponent('https://static.cyberwave.com/media/urdf_projects/robot/../other/secret'))).status, 403);
  });
});
test('untrusted origins cannot establish, reuse or delete a connection', async () => {
  await run(async () => Response.json([]), async request => {
    assert.equal((await request('/gateway/connection', 'POST', { baseUrl: 'https://api.cyberwave.com' }, 'https://unrelated.example.com')).status, 403);
    await request('/gateway/connection', 'POST', { baseUrl: 'https://api.cyberwave.com' });
    assert.equal((await request('/gateway/connection', 'DELETE', undefined, 'https://unrelated.example.com')).status, 403);
    assert.equal((await request('/gateway/connection')).status, 200);
  });
});
