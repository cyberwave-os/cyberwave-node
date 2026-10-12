import test from 'node:test';
import assert from 'node:assert/strict';
import { createCyberwave, CyberwaveError } from '../dist/index.js';

const execution = (status = 'queued') => ({ uuid: 'execution-1', status, created_at: '', prompt_preview: '', output_format: '', request_payload: {}, error_message: '', result: status === 'completed' ? { output: 'ok' } : null });
const quick = { pollIntervalMs: 1, timeoutMs: 2000 };

test('model helpers submit once, poll sequentially and read the same execution on resume', async () => {
  const calls: string[] = [], progress: string[] = [];
  let reads = 0, tokens = 0;
  const client = createCyberwave({ getToken: () => `token-${++tokens}`, fetch: async request => {
    assert.equal(request.headers.get('Authorization'), `Bearer token-${tokens}`);
    calls.push(`${request.method} ${new URL(request.url).pathname}`);
    if (request.method === 'POST') return Response.json({ status: 'queued', execution_uuid: 'execution-1', poll_url: 'https://untrusted.example/job' }, { status: 202 });
    return Response.json(execution(++reads > 1 ? 'completed' : 'queued'));
  }});
  const accepted = await client.mlmodels.run('model-1', { prompt: 'Inspect' });
  const completed = await client.mlmodels.waitForExecution(accepted.execution_uuid!, { ...quick, onProgress: row => progress.push(row.status) });
  assert.equal(completed.result?.output, 'ok');
  await client.mlmodels.waitForExecution(accepted.execution_uuid!, quick);
  assert.deepEqual(progress, ['queued', 'completed']);
  assert.deepEqual(calls, ['POST /api/v1/mlmodels/model-1/run', ...Array(3).fill('GET /api/v1/mlmodels/executions/execution-1')]);
});

test('failed executions are terminal; callers retain the server error', async () => {
  let reads = 0;
  const client = createCyberwave({ fetch: async () => { reads++; return Response.json({ ...execution('failed'), error_message: 'GPU unavailable' }); } });
  assert.equal((await client.mlmodels.waitForExecution('execution-1', quick)).error_message, 'GPU unavailable');
  assert.equal(reads, 1);
});

test('HTTP failures are preserved and never retried or resubmitted', async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    let calls = 0;
    const client = createCyberwave({ fetch: async () => { calls++; return Response.json({ detail: 'No access' }, { status }); } });
    await assert.rejects(client.mlmodels.waitForExecution('execution-1', quick), error => error instanceof CyberwaveError && error.status === status);
    assert.equal(calls, 1);
  }
});

test('abort during the polling delay stops before another request; resume uses GET only', async () => {
  let calls = 0;
  const controller = new AbortController();
  const client = createCyberwave({ fetch: async request => { assert.equal(request.method, 'GET'); calls++; return Response.json(execution()); } });
  await assert.rejects(client.mlmodels.waitForExecution('execution-1', {
    ...quick, pollIntervalMs: 1000, signal: controller.signal,
    onProgress: () => { setTimeout(() => controller.abort(), 5); },
  }), { name: 'AbortError' });
  assert.equal(calls, 1);
  await assert.rejects(client.mlmodels.waitForExecution('execution-1', { ...quick, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('a lost submission response never triggers a second model run', async () => {
  let calls = 0;
  const client = createCyberwave({ fetch: async request => {
    calls++;
    assert.equal(request.method, 'POST');
    throw new TypeError('Connection lost after submission');
  }});
  await assert.rejects(client.mlmodels.run('model-1', { prompt: 'Inspect' }), /Connection lost/);
  assert.equal(calls, 1);
});

test('monitoring deadline aborts an in-flight read and can later resume', async () => {
  let reads = 0;
  const client = createCyberwave({ fetch: request => {
    reads++;
    if (reads > 1) return Promise.resolve(Response.json(execution('completed')));
    return new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
  }});
  await assert.rejects(client.mlmodels.waitForExecution('execution-1', { ...quick, timeoutMs: 20 }), { name: 'TimeoutError' });
  assert.equal((await client.mlmodels.waitForExecution('execution-1', quick)).status, 'completed');
  assert.equal(reads, 2);
});

test('monitoring rejects changed identity, unknown status and invalid timer settings', async () => {
  for (const row of [{ ...execution(), uuid: 'other' }, execution('unknown')]) {
    const client = createCyberwave({ fetch: async () => Response.json(row) });
    await assert.rejects(client.mlmodels.waitForExecution('execution-1', quick), /different|Unsupported/);
  }
  const client = createCyberwave({ fetch: async () => { assert.fail('Invalid duration must not reach the API'); } });
  for (const value of [0, -1, Infinity, NaN, 2 ** 32]) {
    await assert.rejects(client.mlmodels.waitForExecution('execution-1', { timeoutMs: value }), /durations/);
    await assert.rejects(client.mlmodels.waitForExecution('execution-1', { pollIntervalMs: value }), /durations/);
  }
});
