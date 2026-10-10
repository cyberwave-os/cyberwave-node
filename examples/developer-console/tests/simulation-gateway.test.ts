import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulationGateway } from '../simulation-gateway.mjs';
const req = { method: 'POST' };
const url = (action: string) => new URL(`http://127.0.0.1/api/simulation/${action}`);
test('physics simulation lifecycle uses fixed bounds and stops only its own returned identity', async () => {
  const calls: { path: string; method: string; body: any }[] = [];
  const gateway = createSimulationGateway({ mode: 'connected', environmentUuid: 'local-env', allowSimulationLaunch: true },
    async (path: string, method = 'GET', body?: any) => { calls.push({ path, method, body });
      return Response.json(method === 'GET' ? { active_simulations: [] } : path.endsWith('/stop') ? { status: 'stopping' } : { simulation: { simulation_id: 'owned-123', status: 'pending' } }); });
  await assert.rejects(gateway.handle(req, url('stop'), () => {}), /does not own/);
  await gateway.handle(req, url('start'), () => {});
  assert.deepEqual(calls[1].body, { backend: 'mujoco', duration: 30, stream_data: false, auto_run_controllers: false,
    runtime: { interface: 'basic', physics_device: 'cpu', controller_device: 'cpu', num_envs: 1 } });
  await assert.rejects(gateway.handle(req, url('start'), () => {}), /already owns/);
  await gateway.handle(req, url('stop'), () => {});
  assert.equal(calls.at(-1)?.path, '/api/v1/environments/local-env/simulations/owned-123/stop');
});
test('fixture and existing simulations cannot trigger or replace a physics worker', async () => {
  const fixture = createSimulationGateway({ mode: 'fixture', allowSimulationLaunch: true }, () => { throw new Error('No upstream expected'); });
  await assert.rejects(fixture.handle(req, url('start'), () => {}), /Enable simulation launch/);
  const occupied = createSimulationGateway({ mode: 'connected', environmentUuid: 'env', allowSimulationLaunch: true }, async () => Response.json({ active_simulations: [{ simulation_id: 'existing' }] }));
  await assert.rejects(occupied.handle(req, url('start'), () => {}), /existing simulation/);
});

test('an ambiguous start outcome prevents accidental duplicate worker requests', async () => {
  let posts = 0;
  const gateway = createSimulationGateway({ mode: 'connected', environmentUuid: 'env', allowSimulationLaunch: true }, async (_path: string, method = 'GET') => {
    if (method === 'GET') return Response.json({ active_simulations: [] });
    posts++; throw new Error('Connection lost after dispatch');
  });
  await assert.rejects(gateway.handle(req, url('start'), () => {}), /Connection lost/);
  await assert.rejects(gateway.handle(req, url('start'), () => {}), /outcome is unknown/);
  assert.equal(posts, 1);
});
