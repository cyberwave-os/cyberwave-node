import test from 'node:test';
import assert from 'node:assert/strict';
import { createCyberwave, CyberwaveError } from '../dist/index.js';
import { collectEpisodes, selectEpisode, approvedEvidence, appendEvidence } from '../examples/recipes/evidence.ts';
import { listHumanActions, respondToAction } from '../examples/recipes/human-actions.ts';
import { readWorkspaceGovernance } from '../examples/recipes/governance.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('reviewed evidence keeps the server cursor and stops on a review conflict without retrying', async () => {
  const requests: Request[] = [];
  const client = createCyberwave({ fetch: async input => {
    const request = input as Request; requests.push(request);
    const url = new URL(request.url);
    if (url.pathname.endsWith('/review')) return json({ detail: 'Reload the sample' }, 409);
    if (request.method === 'POST') return json({ uuid: 'sample', review_status: 'pending', revision: 1 });
    return url.searchParams.get('after') === '0'
      ? json({ items: [{ uuid: 'first' }], next_after: 42 })
      : json({ items: [{ uuid: 'last' }], next_after: null });
  } });
  const sample = await appendEvidence(client, 'dataset', 'attachment');
  assert.equal(sample.review_status, 'pending');
  assert.deepEqual(await requests[0].json(), { attachment_uuid: 'attachment' });
  const ids: string[] = [];
  for await (const item of approvedEvidence(client, 'dataset')) ids.push(item.uuid);
  assert.deepEqual(ids, ['first', 'last']);
  assert.equal(new URL(requests[2].url).searchParams.get('after'), '42');
  assert.equal(new URL(requests[2].url).searchParams.get('approved_only'), 'true');
  await assert.rejects(client.datasets.reviewSample('dataset', sample.uuid, { revision: 1, status: 'approved', annotations: [] }), (error: unknown) => error instanceof CyberwaveError && error.status === 409);
  assert.equal(requests.length, 4);
});

test('human action helpers preserve scope, abort signals and backend response status', async () => {
  const requests: Request[] = [];
  const controller = new AbortController();
  const client = createCyberwave({ fetch: async input => {
    const request = input as Request; requests.push(request);
    return request.method === 'GET' ? json([{ uuid: 'action', status: 'pending' }]) : json({ uuid: 'action', status: 'responded' });
  } });
  const [action] = await listHumanActions(client, 'workspace', controller.signal);
  const response = await respondToAction(client, action.uuid, { decision: 'completed', note: 'Inspected' }, controller.signal);
  assert.equal(response.status, 'responded');
  assert.equal(new URL(requests[0].url).searchParams.get('workspace_uuid'), 'workspace');
  assert.deepEqual(await requests[1].json(), { decision: 'completed', note: 'Inspected' });
  controller.abort();
  assert.ok(requests.every(request => request.signal.aborted));
});

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
