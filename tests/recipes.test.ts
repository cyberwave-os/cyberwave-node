import test from 'node:test';
import assert from 'node:assert/strict';
import { createCyberwave, CyberwaveError } from '../dist/index.js';
import { collectEpisodes, selectEpisode } from '../examples/recipes/evidence.ts';
import { readWorkspaceGovernance } from '../examples/recipes/governance.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('dataset collection preserves accepted failed rows and never recreates Episodes or retries', async () => {
  const requests: Request[] = [];
  const client = createCyberwave({ fetch: async input => { requests.push(input as Request); return json({ uuid: 'dataset', status: 'failed' }); } });
  const result = await collectEpisodes(client, 'Selected evidence', ['episode', 'episode']);
  assert.deepEqual(result, { uuid: 'dataset', status: 'failed' });
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).pathname, '/api/v1/datasets');
  assert.deepEqual(await requests[0].json(), { name: 'Selected evidence', episodes: ['episode'], allow_pending_recordings: false });
});

test('pending recordings stay blocked and unauthorized Episode selection cannot advance', async () => {
  let calls = 0;
  const client = createCyberwave({ fetch: async input => {
    calls++;
    return json({ detail: 'private diagnostic' }, new URL((input as Request).url).pathname.endsWith('/datasets') ? 409 : 403);
  } });
  await assert.rejects(collectEpisodes(client, 'Selected evidence', ['episode']), (error: unknown) => error instanceof CyberwaveError && error.status === 409);
  await assert.rejects(selectEpisode(client, { task_name: 'Inspect', twins: ['robot', 'camera'], started_at: 1000000, finished_at: 2000000 }), (error: unknown) => error instanceof CyberwaveError && error.status === 403);
  assert.equal(calls, 2);
});

test('workspace reporting derives organization and preserves unavailable billing separately from metrics', async () => {
  const requests: Request[] = [];
  const client = createCyberwave({ fetch: async input => {
    const request = input as Request; requests.push(request);
    const path = new URL(request.url).pathname;
    if (path === '/api/v1/users/workspaces/workspace') return json({ team: { uuid: 'workspace', organization: 'organization' } });
    if (path === '/api/v1/organizations/organization/credits') return json({ detail: 'forbidden' }, 403);
    return json(path === '/api/v1/workflows' ? [] : { workspace_uuid: 'workspace' });
  } });
  const view = await readWorkspaceGovernance(client, 'workspace', { start_timestamp: '2026-10-01T00:00:00+02:00', end_timestamp: '2026-11-01T00:00:00Z' });
  assert.equal(view.credits.status, 'rejected');
  assert.equal(view.ai.status, 'fulfilled');
  assert.equal(view.scheduled.status, 'fulfilled');
  assert.ok(requests.every(request => request.method === 'GET'));
  const ai = new URL(requests.find(request => request.url.includes('/metrics/ai/'))!.url);
  assert.equal(ai.searchParams.get('start_timestamp'), '2026-09-30T22:00:00.000Z');
  const scheduled = new URL(requests.find(request => request.url.includes('/workflows?'))!.url);
  assert.equal(scheduled.searchParams.get('workspace_uuid'), 'workspace');
  assert.equal(scheduled.searchParams.get('limit'), '25');
});
