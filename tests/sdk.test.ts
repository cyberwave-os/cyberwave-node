import test from 'node:test';
import assert from 'node:assert/strict';
import { createCyberwave, normalizeApiUrl, assetModel, CyberwaveError } from '../dist/index.js';
import { resolveUrdfResource } from '../packages/environment-3d/dist/index.js';
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
test('origin validation accepts production/custom HTTPS and loopback, rejects credential/path confusion', () => {
  assert.equal(normalizeApiUrl(), 'https://api.cyberwave.com');
  assert.equal(normalizeApiUrl('http://localhost:8000/'), 'http://localhost:8000');
  assert.equal(normalizeApiUrl('https://api.example.com'), 'https://api.example.com');
  for (const value of ['http://api.example.com', 'https://token@example.com', 'https://api.example.com/api', 'https://api.example.com?token=x', 'ftp://localhost']) assert.throws(() => normalizeApiUrl(value));
});
test('token provider refreshes per request; separate origins do not inherit credentials', async () => {
  let token = 'first'; const requests: Request[] = [];
  const fetcher = async (input: RequestInfo | URL) => { requests.push(input as Request); return response([]); };
  const client = createCyberwave({ getToken: () => token, fetch: fetcher });
  await client.assets.list(); token = 'refreshed'; await client.assets.list();
  await createCyberwave({ baseUrl: 'https://custom.example.com', fetch: fetcher }).assets.list();
  assert.deepEqual(requests.map(r => r.headers.get('Authorization')), ['Bearer first', 'Bearer refreshed', null]);
  assert.ok(requests.every(r => r.redirect === 'error' && r.credentials === 'omit'));
});
test('API errors expose status without reflecting token-bearing server text in the message', async () => {
  const client = createCyberwave({ fetch: async () => response({ detail: 'secret upstream diagnostic' }, 401) });
  await assert.rejects(client.environments.list(), (e: unknown) => e instanceof CyberwaveError && e.status === 401 && !e.message.includes('secret'));
});
test('abort propagates to the transport', async () => {
  const abort = new AbortController(); abort.abort();
  const client = createCyberwave({ fetch: async input => { const request = input as Request; request.signal.throwIfAborted(); return response([]); } });
  await assert.rejects(client.assets.list({}, { signal: abort.signal }), { name: 'AbortError' });
});
test('environment loading deduplicates assets and preserves measured poses and joint values', async () => {
  const urls: string[] = [];
  const twins = [1, 2].map(n => ({ uuid: `twin-${n}`, name: `Robot ${n}`, asset_uuid: 'asset-1', position_x: n, position_y: 0, position_z: .4, rotation_w: 1, scale_x: 2, joint_states: { hip: { position: .4 }, knee: -.7 } }));
  const client = createCyberwave({ baseUrl: 'http://localhost:8000', fetch: async input => {
    const path = new URL((input as Request).url).pathname; urls.push(path);
    return response(path.endsWith('/twins') ? twins : path.includes('/assets/') ? { urdf_file: '/media/robot.urdf' } : { uuid: 'environment', name: 'Test' });
  }});
  const snapshot = await client.loadEnvironment('environment');
  assert.equal(urls.filter(p => p.includes('/assets/')).length, 1);
  assert.equal(snapshot.objects.length, 2); assert.equal(snapshot.objects[1].position.x, 2);
  assert.equal(snapshot.objects[0].model?.url, 'http://localhost:8000/media/robot.urdf');
  assert.deepEqual(snapshot.objects[0].joints, { hip: .4, knee: -.7 }); assert.equal(snapshot.objects[0].scale.x, 2);
});
test('unavailable assets and unresolved attached frames are reported instead of fabricated', async () => {
  const client = createCyberwave({ fetch: async input => {
    const path = new URL((input as Request).url).pathname;
    if (path.includes('/assets/')) return response({}, 404);
    return response(path.endsWith('/twins') ? [{ uuid: 'a', name: 'Missing', asset_uuid: 'missing' }, { uuid: 'b', name: 'Tool', attach_to_twin_uuid: 'a' }] : { uuid: 'environment' });
  }});
  const snapshot = await client.loadEnvironment('environment'); assert.equal(snapshot.objects.length, 1);
  assert.equal(snapshot.objects[0].model, undefined); assert.ok(snapshot.warnings.some(w => w.includes('resolved world pose')));
});
test('asset model URLs resolve against their connection; unsafe schemes cannot load', () => {
  assert.equal(assetModel({ urdf_file: null, glb_file: '/media/scene.glb' }, 'https://custom.example.com')?.url, 'https://custom.example.com/media/scene.glb');
  assert.throws(() => assetModel({ urdf_file: 'javascript:alert(1)', glb_file: null }, 'https://api.cyberwave.com'));
});
test('a malformed twin model cannot prevent other environment objects from loading', async () => {
  const client = createCyberwave({ fetch: async input => {
    const path = new URL((input as Request).url).pathname;
    return response(path.endsWith('/twins') ? [
      { uuid: 'broken', name: 'Broken', urdf_file: 'http://[broken' },
      { uuid: 'valid', name: 'Valid', glb_file: 'https://storage.example.com/robot.glb' },
    ] : {uuid:'environment'});
  }});
  const snapshot = await client.loadEnvironment('environment');
  assert.equal(snapshot.objects.length,2);
  assert.equal(snapshot.objects[0].model,undefined);
  assert.equal(snapshot.objects[1].model?.kind,'glb');
  assert.ok(snapshot.warnings.some(w=>w.includes('invalid model URL')));
});
test('URDF resource resolver supports real production Go2 paths, packages and relative resources', () => {
  const model = { kind: 'urdf' as const, url: 'https://static.cyberwave.com/media/urdf_projects/go2/urdf/robot.urdf' };
  const expected = 'https://static.cyberwave.com/media/urdf_projects/go2/dae/base.dae';
  assert.equal(resolveUrdfResource('/../../dae/base.dae', model), expected);
  assert.equal(resolveUrdfResource('../dae/base.dae', model), expected);
  assert.equal(resolveUrdfResource('package://go2/dae/base.dae', model), expected);
  assert.equal(resolveUrdfResource('package://custom/part.stl', { ...model, packageRoots: { custom: 'https://cdn.example.com/meshes' } }), 'https://cdn.example.com/meshes/part.stl');
});
