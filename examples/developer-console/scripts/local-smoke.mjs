import assert from 'node:assert/strict';
const base = new URL(process.env.DEMO_GATEWAY_URL || 'http://127.0.0.1:8787');
assert(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Only a loopback gateway is allowed.');
const origin = 'http://127.0.0.1:5173';
async function request(path, body) {
  const response = await fetch(new URL(path, base), { method: body ? 'POST' : 'GET',
    headers: { Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000) });
  assert(response.ok, `Gateway ${path} returned ${response.status}`); return response.json();
}
const context = await request('/api/controller/context');
assert.equal(context.transport, 'local-cyberwave-mqtt', 'Configure connected local MQTT mode first.');
const before = await request('/api/snapshot');
const opened = await request('/api/controller/open', {});
let sequence = 0;
const input = keys => request('/api/controller/input', { sessionId: opened.sessionId, sequence: ++sequence, sentAt: Date.now(), keys });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await input(['Space', 'KeyW']); await delay(150); await input([]); await delay(100);
  const state = await request('/api/controller/state');
  assert(state.received >= 2, 'The local broker must echo both motion and release inputs.');
  assert.equal(state.lastPacket.source_type, 'sim_tele');
  assert.equal(state.lastPacket.data.contract, 'locomotion.velocity_command.v1');
  assert.equal(state.lastPacket.data.linear_x, 0);
  assert.equal(state.preview.velocity.linear_x, 0);
  assert(state.preview.position.x > 0 && state.preview.position.x < .16);
  await input(['Space', 'KeyW']); await delay(650);
  const expired = await request('/api/controller/state');
  assert.equal(expired.preview.velocity.linear_x, 0, 'Lost browser input must expire.');
  const after = await request('/api/snapshot');
  const pose = data => data.twins.find(twin => twin.uuid === context.twinUuid)?.position;
  assert.deepEqual(pose(after), pose(before), 'The reference consumer must not overwrite the observed twin.');
  console.log(JSON.stringify({ result: 'pass', transport: context.transport, contract: context.contract,
    received: expired.received, observedPoseUnchanged: true, watchdogStopped: true }));
} finally { await request('/api/controller/close', { sessionId: opened.sessionId }); }
