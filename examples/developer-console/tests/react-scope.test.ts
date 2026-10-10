import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { AssetBrowser, CyberwaveProvider, RecordingBrowser, WorkflowMonitor } from '@cyberwave/react';
import { createCyberwave, type Workflow } from 'cyberwave';

async function mounted(run: (view: {
  element: HTMLElement;
  render: (element: ReturnType<typeof h>) => Promise<void>;
  click: (text: string) => Promise<void>;
}) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const element = document.getElementById('root')!;
  const root = createRoot(element);
  try {
    await run({
      element,
      render: async element => { await act(async () => root.render(element)); },
      click: async text => {
        const button = Array.from(element.querySelectorAll('button')).find(button => button.textContent?.includes(text));
        assert.ok(button, `Button missing: ${text}`);
        assert.equal(button.disabled, false, `Button disabled: ${text}`);
        await act(async () => button.click());
      },
    });
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
}
const workflow = (uuid: string) => ({ uuid, nodes: [] }) as unknown as Workflow;

test('monitor resets run selection and pagination when the workflow changes', async () => {
  const requests: URL[] = [];
  const client = createCyberwave({ fetch: async request => {
    const url = new URL((request as Request).url);
    requests.push(url);
    const [, id, runId] = url.pathname.match(/workflows\/([^/]+)\/executions(?:\/([^/]+))?/) ?? [];
    if (runId) return id === 'a' ? Response.json({ uuid: runId, status: 'waiting' }) : Response.json({ detail: 'Unknown execution' }, { status: 404 });
    const offset = Number(url.searchParams.get('offset') ?? 0);
    return Response.json(id === 'a' ? Array.from({ length: 11 }, (_, n) => ({ uuid: `run-a-${offset + n}`, status: 'waiting' })) : []);
  } });
  await mounted(async ({ render, click, element }) => {
    await render(h(WorkflowMonitor, { client, workflow: workflow('a'), serverPagination: true, readOnly: false }));
    await click('Older runs');
    await click('run-a-11');
    requests.length = 0;
    await render(h(WorkflowMonitor, { client, workflow: workflow('b'), serverPagination: true, readOnly: false }));
    assert.equal(requests.some(url => url.pathname.includes('run-a-')), false, 'Never request a run from the previous workflow');
    assert.equal(requests[0].searchParams.get('offset'), '0');
    assert.doesNotMatch(element.textContent!, /run-a-|Cancel run/);
    assert.match(element.textContent!, /No executions yet/);
  });
});

test('monitor clears old run actions immediately when the API client changes', async () => {
  const client = createCyberwave({ fetch: async request => Response.json(
    (request as Request).url.endsWith('/executions') ? [{ uuid: 'old-run', status: 'waiting' }] : { uuid: 'old-run', status: 'waiting' },
  ) });
  const next = createCyberwave({ baseUrl: 'http://localhost:8008', fetch: () => new Promise<Response>(() => {}) });
  await mounted(async ({ render, element }) => {
    await render(h(WorkflowMonitor, { client, workflow: workflow('same-id'), readOnly: false }));
    assert.match(element.textContent!, /Cancel run/);
    await render(h(WorkflowMonitor, { client: next, workflow: workflow('same-id'), readOnly: false }));
    assert.doesNotMatch(element.textContent!, /old-run|Cancel run/);
  });
});

test('catalog pagination restarts when the provider changes API client', async () => {
  const requests: URL[] = [];
  const client = createCyberwave({ fetch: async () => Response.json(Array.from({ length: 12 }, (_, n) => ({ uuid: `asset-${n}`, name: `Asset ${n}` }))) });
  const next = createCyberwave({ baseUrl: 'http://localhost:8008', fetch: async request => { requests.push(new URL((request as Request).url)); return Response.json([]); } });
  await mounted(async ({ render, click }) => {
    const view = (value: typeof client) => h(CyberwaveProvider, { client: value, children: h(AssetBrowser, { onSelect() {} }) });
    await render(view(client));
    await click('Next');
    await render(view(next));
    assert.equal(requests[0].searchParams.get('offset'), '0');
  });
});

test('recording cursors belong to their API client as well as environment', async () => {
  const requests: URL[] = [];
  const client = createCyberwave({ fetch: async () => Response.json({ items: [], has_more: true, next_cursor: 'old-cursor' }) });
  const next = createCyberwave({ baseUrl: 'http://localhost:8008', fetch: async request => { requests.push(new URL((request as Request).url)); return Response.json({ items: [], has_more: false }); } });
  await mounted(async ({ render, click }) => {
    const view = (value: typeof client) => h(CyberwaveProvider, { client: value, children: h(RecordingBrowser, { environmentUuid: 'same-id', onSelect() {} }) });
    await render(view(client));
    await click('Next');
    await render(view(next));
    assert.equal(requests[0].searchParams.has('cursor'), false);
  });
});

test('sensor history clears the old sensor rows and resets its offset before the next request', async () => {
  const { SensorTelemetryPanel } = await import('@cyberwave/react');
  const requests: URL[] = [];
  const client = createCyberwave({ fetch: async request => {
    const url = new URL((request as Request).url); requests.push(url);
    if (url.searchParams.get('sensor_id') === 'rear') return new Promise<Response>(() => {});
    return Response.json({ items: [{ uuid: 'old-sample', timestamp: '2026-10-10T10:00:00Z', event_type: 'twin_imu_update', metadata: { sensor_id: 'front', acceleration: [0,0,9.8] } }], total: 42, has_more: true });
  } });
  const view = (sensorId: string) => h(CyberwaveProvider, { client, children: h(SensorTelemetryPanel, { twinUuid: 'robot', sensorId, start: '2026-10-10T00:00:00Z', end: '2026-10-11T00:00:00Z' }) });
  await mounted(async ({ render, click, element }) => {
    await render(view('front')); await click('Older');
    assert.match(element.textContent!, /acceleration/);
    await render(view('rear'));
    assert.equal(requests.at(-1)?.searchParams.get('offset'), '0');
    assert.equal(requests.at(-1)?.searchParams.get('sensor_id'), 'rear');
    assert.doesNotMatch(element.textContent!, /acceleration|front/);
  });
});

test('video source changes, disabling and unmount close pending peers and detach the old video', async () => {
  const { VideoStream } = await import('@cyberwave/react/video');
  const peers: any[] = [];
  class Peer extends EventTarget {
    connectionState = 'new'; iceGatheringState = 'gathering'; closed = false;
    constructor() { super(); peers.push(this); }
    addTransceiver() {}
    async createOffer() { return { sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=rtpmap:96 VP8/90000\r\n' }; }
    async setLocalDescription() {}
    close() { this.closed = true; this.connectionState = 'closed'; this.dispatchEvent(new Event('connectionstatechange')); }
  }
  const previous = { RTCPeerConnection: globalThis.RTCPeerConnection, MediaStream: globalThis.MediaStream };
  Object.assign(globalThis, { RTCPeerConnection: Peer, MediaStream: class { getTracks() { return []; } } });
  const client = createCyberwave({ fetch: async () => assert.fail('no signaling before ICE completes') });
  const view = (streamSource: 'live' | 'simulation', enabled = true) => h(CyberwaveProvider, { client, children: h(VideoStream, { target: { twinUuid: 'robot', sensorId: 'front', streamSource }, enabled }) });
  try {
    await mounted(async ({ render, element }) => {
      await render(view('live')); const oldVideo = element.querySelector('video');
      await render(view('simulation'));
      assert.equal(peers[0].closed, true); assert.notEqual(element.querySelector('video'), oldVideo);
      assert.equal((oldVideo as HTMLVideoElement).srcObject, null);
      await render(view('simulation', false)); assert.equal(peers[1].closed, true);
      await render(view('live'));
      await act(async () => window.dispatchEvent(new window.Event('pagehide')));
      assert.equal(peers.at(-1).closed, true, 'Full-page navigation also disposes the viewer');
    });
    assert.equal(peers.at(-1).closed, true);
  } finally { Object.assign(globalThis, previous); }
});
