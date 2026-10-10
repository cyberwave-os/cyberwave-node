import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from '../server.mjs';
const settings = {
  mode: 'connected', apiUrl: 'http://127.0.0.1:8000', token: 'test-only-server-token',
  environmentUuid: 'env-a', twinUuids: [], allowExecution: true, georefVerified: true,
  anchor: { longitude: 12, latitude: 41, height: 0, yawDegrees: 0 },
};
const draft = { revision: 1, points: [{ id: 'a', name: 'A', position: { x: 1, y: 2, z: 0 } }] };
async function withGateway(options, upstream, run) {
  const server = createGateway(options, upstream);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const request = (path, body, origin = 'http://127.0.0.1:5173') => fetch(`http://127.0.0.1:${port}${path}`, {
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body),
  });
  try { await run(request); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const json = value => Response.json(value);
test('unverified georeference prevents live dispatch even when execution is enabled', async () => {
  const calls = [];
  await withGateway({ ...settings, georefVerified: false }, async (url, options) => {
    calls.push(options.method); return json({ environment_uuid: 'env-a' });
  }, async request => {
    assert.equal((await request('/api/twins/robot/execute', { draft })).status, 403);
    assert.deepEqual(calls, ['GET']);
  });
});
test('cross-environment target and cross-origin POST cannot dispatch', async () => {
  const calls = [];
  await withGateway(settings, async (url, options) => {
    calls.push(options.method); return json({ environment_uuid: 'env-b' });
  }, async request => {
    assert.equal((await request('/api/twins/robot/execute', { draft })).status, 403);
    assert.equal((await request('/api/twins/robot/execute', { draft }, 'https://other.invalid')).status, 403);
    assert.deepEqual(calls, ['GET']);
  });
});
test('snapshot never exposes the token or misprojects relative-frame waypoints', async () => {
  await withGateway(settings, async url => {
    if (url.pathname.endsWith('/twins')) return json([{ uuid: 'robot', name: 'Robot', position_x: 1, position_y: 2, position_z: 0 }]);
    return json([{ id: 'a', name: 'A', position: { x: 1, y: 2, z: 0 } },
      { id: 'b', name: 'B', frame: { type: 'twin_link' }, position: { x: 1, y: 2, z: 0 } }]);
  }, async request => {
    const response = await request('/api/snapshot'); const text = await response.text(); const data = JSON.parse(text);
    assert.equal(text.includes(settings.token), false);
    assert.equal(data.waypoints.length, 1);
    assert.equal(data.unsupportedWaypoints, 1);
  });
});
test('explicit dispatch forwards one local-navigation command with server credentials', async () => {
  const calls = [];
  await withGateway(settings, async (url, options) => {
    calls.push({ path: url.pathname, ...options });
    return options.method === 'GET' ? json({ environment_uuid: 'env-a' }) : json({ action_id: 'action', status: 'queued' });
  }, async request => {
    const response = await request('/api/twins/robot/execute', { draft });
    assert.equal(response.status, 200);
    assert.equal(calls[1].path, '/api/v1/twins/robot/navigation');
    assert.equal(calls[1].headers.Authorization, `Bearer ${settings.token}`);
    assert.equal(calls[1].redirect, 'error');
    assert.deepEqual(JSON.parse(calls[1].body).waypoints[0].position, { x: 1, y: 2, z: 0 });
  });
});
test('fixture execution is labeled preview and makes no Cyberwave request', async () => {
  await withGateway({ ...settings, mode: 'fixture' }, () => { throw new Error('Unexpected upstream request.'); }, async request => {
    const response = await request('/api/twins/fixture-rover/execute', { draft });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.status, 'fixture_preview_completed');
    assert.match(data.message, /No physical command/);
  });
});
test('encoded path segments cannot turn action routes into an upstream proxy', async () => {
  await withGateway(settings, () => { throw new Error('Unexpected upstream request.'); }, async request => {
    assert.equal((await request('/api/twins/robot/actions/%2Fpermissions', {})).status, 404);
    assert.equal((await request('/api/twins/robot/actions/action%3Fredirect=other')).status, 404);
  });
});
