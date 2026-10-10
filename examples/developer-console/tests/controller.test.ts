import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from '../server.mjs';
const base = { mode: 'fixture', apiUrl: 'http://127.0.0.1:8000',
  anchor: { longitude: 12, latitude: 41, height: 0, yawDegrees: 0 } };
async function run(options, upstream, action) {
  const server = createGateway(options, upstream); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const root = `http://127.0.0.1:${server.address().port}`;
  const request = (route, body) => fetch(`${root}/api/controller/${route}`, { method: body ? 'POST' : 'GET',
    headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  try { await action(request); } finally { await new Promise(resolve => server.close(resolve)); }
}
test('controller session maps keys into the real simulation input contract and isolates ownership', async () => {
  await run(base, () => { throw new Error('Fixture must not call Cyberwave.'); }, async request => {
    const opened = await (await request('open', {})).json();
    assert.equal((await request('open', {})).status, 409);
    const body = { sessionId: opened.sessionId, sequence: 1, sentAt: Date.now(), keys: ['Space', 'KeyW'] };
    const response = await request('input', body), data = await response.json();
    assert.equal(response.status, 200); assert.equal(data.packet.source_type, 'sim_tele');
    assert.equal(data.packet.data.contract, 'locomotion.velocity_command.v1');
    assert.equal(data.packet.data.linear_x, .5);
    assert.equal((await request('input', body)).status, 400);
    assert.equal((await request('input', { ...body, sessionId: 'another', sequence: 2 })).status, 409);
    assert.equal((await request('close', { sessionId: 'another' })).status, 409);
    assert.equal((await (await request('state')).json()).active, true, 'A stale tab cannot close another owner');
    const stopped = await request('input', { ...body, sequence: 2, sentAt: Date.now(), keys: [] });
    assert.equal(stopped.status, 200, 'release is never repeat-throttled');
    const state = await (await request('state')).json(); assert.equal(state.received, 2);
    await request('close', { sessionId: opened.sessionId });
    assert.equal((await (await request('state')).json()).active, false);
  });
});
test('keyboard input cannot select a physical policy or a remote backend', async () => {
  const connected = { ...base, mode: 'connected', token: 'server-test-only', environmentUuid: 'env',
    controllerTwinUuid: 'robot', controllerUuid: 'policy' };
  await run(connected, async url => Response.json(url.pathname.endsWith('/robot')
    ? { uuid: 'robot', environment_uuid: 'env', controller_policy_uuid: 'policy' }
    : { uuid: 'policy', metadata: { runtime_kind: 'live', physical_enabled: true, execution_contract: 'locomotion.velocity_command.v1' } }),
  async request => { assert.equal((await request('open', {})).status, 409); });
  assert.throws(() => createGateway({ ...connected, apiUrl: 'https://remote.invalid' }), /local Cyberwave API/);
});
test('local policy context uses declared bounds and a revision change invalidates control', async () => {
  let version = 1;
  const connected = { ...base, mode: 'connected', token: 'server-test-only', environmentUuid: 'env',
    controllerTwinUuid: 'robot', controllerUuid: 'policy' };
  await run(connected, async url => Response.json(url.pathname.endsWith('/robot')
    ? { uuid: 'robot', environment_uuid: 'env', controller_policy_uuid: 'policy', updated_at: 'twin-v1' }
    : { uuid: 'policy', name: 'Simulation controller', updated_at: `${version}`, metadata: {
      runtime_kind: 'simulation', physical_enabled: false, execution_contract: 'locomotion.velocity_command.v1',
      max_linear_x: .2, max_angular_z: .3, linear_y_supported: false } }), async request => {
      const session = await (await request('open', {})).json();
      assert.equal(session.limits.linear, .2);
      const response = await request('input', { sessionId: session.sessionId, sequence: 1, sentAt: Date.now(), keys: ['Space', 'KeyA'] });
      assert.equal((await response.json()).packet.data.linear_y, 0);
      assert.equal(session.revision, 'robot:policy:1'); version = 2;
      await new Promise(resolve => setTimeout(resolve, 1050));
      assert.equal((await request('input', { sessionId: session.sessionId, sequence: 2, sentAt: Date.now(), keys: ['Space', 'KeyW'] })).status, 409);
      assert.equal((await (await request('state')).json()).active, false);
    });
});
test('controller input expires without a browser release message', async () => {
  await run(base, () => { throw new Error('No backend expected.'); }, async request => {
    const session = await (await request('open', {})).json();
    await request('input', { sessionId: session.sessionId, sequence: 1, sentAt: Date.now(), keys: ['Space', 'KeyW'] });
    await new Promise(resolve => setTimeout(resolve, 650));
    const state = await (await request('state')).json();
    assert.equal(state.preview.velocity.linear_x, 0);
    assert.ok(state.preview.position.x <= .151);
    assert.equal(state.lastPacket.data.linear_x, 0);
  });
});
