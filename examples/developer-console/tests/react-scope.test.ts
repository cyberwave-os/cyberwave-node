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

test('live telemetry discards old sensor samples and closes subscriptions on retarget and pause', async () => {
  const { LiveSensorTelemetryPanel } = await import('@cyberwave/react');
  let receive: (sample: unknown) => void = () => {}, closed = 0;
  const transport = { subscribe: async (_topic: string, listener: typeof receive) => { receive = listener; return () => { closed++; }; } };
  const client = createCyberwave();
  const view = (id: string) => h(CyberwaveProvider, { client, children: h(LiveSensorTelemetryPanel, { transport, twinUuid: 'robot', sensorId: id, channel: 'imu' }) });
  await mounted(async ({ render, element, click }) => {
    await render(view('front'));
    const sample = { sensor_id: 'front', measurement: 'first-sensor-value', points: Array.from({length: 100}, (_, n) => n) };
    await act(async () => { receive(sample); await new Promise(resolve => setTimeout(resolve, 120)); });
    assert.match(element.textContent!, /68 more items/);
    assert.equal(sample.points.length, 100, 'The display summary never truncates the source payload');
    assert.match(element.textContent!, /first-sensor-value/);
    const oldReceive = receive;
    await render(view('rear'));
    assert.equal(closed, 1);
    await act(async () => { oldReceive({ sensor_id: 'front', measurement: 'late-value' }); await new Promise(resolve => setTimeout(resolve, 120)); });
    assert.doesNotMatch(element.textContent!, /first-sensor-value|late-value/);
    await click('Pause telemetry');
    assert.equal(closed, 2);
    assert.match(element.textContent!, /paused/);
  });
});

test('opinionated video capture stays disabled until decoded video and never autoconnects on target change', async () => {
  const { SensorVideoPanel } = await import('@cyberwave/react/video');
  const client = createCyberwave({ fetch: async () => assert.fail('Must not negotiate before Watch stream') });
  const twin = { uuid: 'robot', name: 'Robot', capabilities: { sensors: [{ id: 'camera', name: 'Camera', type: 'rgb' }] } } as any;
  const view = (source: 'live' | 'simulation') => h(CyberwaveProvider, { client, children: h(SensorVideoPanel, { twin, initialSensorId: 'camera', streamSource: source }) });
  await mounted(async ({ render, element }) => {
    await render(view('live'));
    assert.equal(Array.from(element.querySelectorAll('button')).find(b => b.textContent === 'Capture frame')?.disabled, true);
    assert.equal(element.querySelector('video'), null);
    await render(view('simulation'));
    assert.equal(element.querySelector('video'), null);
    assert.match(element.textContent!, /simulation/);
  });
});

test('frame review replaces and releases previews, and cannot submit an undecoded image', async () => {
  const { CapturedFrameReview } = await import('@cyberwave/react/annotation');
  const previous = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  const revoked: string[] = [];
  let serial = 0;
  URL.createObjectURL = () => `blob:frame-${++serial}`;
  URL.revokeObjectURL = value => { revoked.push(value); };
  const frame = () => ({ blob: new Blob(['png'], { type: 'image/png' }), width: 640, height: 400, mediaTime: 1, capturedAt: '2026-10-10T20:00:00Z' });
  try {
    await mounted(async ({ render, element }) => {
      const view = () => h(CapturedFrameReview, { frame: frame(), onConfirm: () => assert.fail('Image has not decoded') });
      await render(view());
      assert.equal(element.querySelector('img')?.getAttribute('src'), 'blob:frame-1');
      assert.equal(Array.from(element.querySelectorAll('button')).find(b => b.textContent === 'Use reviewed frame')?.disabled, true);
      await render(view());
      assert.deepEqual(revoked, ['blob:frame-1']);
      assert.equal(element.querySelector('img')?.getAttribute('src'), 'blob:frame-2');
    });
    assert.deepEqual(revoked, ['blob:frame-1', 'blob:frame-2']);
  } finally { URL.createObjectURL = previous.create; URL.revokeObjectURL = previous.revoke; }
});

test('inspection browser resets pagination and never shows another API client campaign rows', async () => {
  const { InspectionCampaignBrowser } = await import('@cyberwave/react');
  const requests: URL[]=[];
  const first=createCyberwave({fetch:async()=>Response.json(Array.from({length:10},(_,i)=>({uuid:`old-${i}`,name:`Old campaign ${i}`,asset_reference:'asset',coverage:null})))});
  const second=createCyberwave({fetch:async request=>{requests.push(new URL((request as Request).url));return Response.json([]);}});
  await mounted(async({render,click,element})=>{
    const view=(client:typeof first)=>h(CyberwaveProvider,{client,children:h(InspectionCampaignBrowser,{environmentId:'environment',onSelect(){}})});
    await render(view(first));await click('Next campaigns');await render(view(second));
    assert.equal(requests[0].searchParams.get('offset'),'0');assert.doesNotMatch(element.textContent!,/Old campaign/);
  });
});
test('inspection detail ignores a late campaign response after selection changes', async()=>{
 const {useInspectionCampaign}=await import('@cyberwave/react');
 let finish: (response:Response)=>void=()=>{};
 const client=createCyberwave({fetch:async request=>(request as Request).url.endsWith('/old')?new Promise<Response>(resolve=>{finish=resolve;}):Response.json({uuid:'current',name:'Current campaign',observations:[]})});
 function Detail({id}:{id:string}){const state=useInspectionCampaign('env',id);return h('div',null,state.data?.name||'Loading');}
 await mounted(async({render,element})=>{
 const view=(id:string)=>h(CyberwaveProvider,{client,children:h(Detail,{id})});
 await render(view('old'));await render(view('current'));await act(async()=>finish(Response.json({uuid:'old',name:'Obsolete campaign'})));
 assert.match(element.textContent!,/Current campaign/);assert.doesNotMatch(element.textContent!,/Obsolete/);
 });
});
test('activity details preserve zero, missing units and unavailable evidence without inventing a reading',async()=>{
 const {MeasurementCard,EvidencePreview}=await import('@cyberwave/react');
 await mounted(async({render,element})=>{
 await render(h(MeasurementCard,{result:{id:'x',title:'Reading',outcome:'normal',value:0}}));assert.match(element.textContent!,/0 unit not supplied/);
 await render(h(MeasurementCard,{result:{id:'x',title:'Reading',outcome:'unavailable',value:88,unit:'bar'}}));assert.doesNotMatch(element.textContent!,/88 bar/);assert.match(element.textContent!,/No measured value/);
 await render(h(EvidencePreview,{src:'javascript:alert(1)',caption:'Inspection'}));assert.equal(element.querySelector('img'),null);assert.match(element.textContent!,/Evidence is unavailable/);
 });
});
test('latest review is chosen by revision and absent coverage is never rendered as resolution',async()=>{
 const {InspectionObservationDetails}=await import('@cyberwave/react');
 const base={uuid:'o',campaign_uuid:'c',defect_uuid:'d',source:{external_id:'o',defect_external_id:'d',kind:'Crack',observed:false,limitation:'No coverage'},reviews:[]} as any;
 await mounted(async({render,element})=>{
 await render(h(InspectionObservationDetails,{observation:base}));assert.match(element.textContent!,/coverage unconfirmed/);assert.doesNotMatch(element.textContent!,/resolved/);
 const review=(revision:number,technical_state:string)=>({uuid:`r${revision}`,revision,assessment:{decision:'validated',technical_state,severity:'low',priority:'routine'},reason:'Reviewed',created_at:'2026-10-11',created_by_uuid:'reviewer'});
 await render(h(InspectionObservationDetails,{observation:{...base,reviews:[review(2,'stable'),review(1,'new')]}}));
 assert.equal(element.querySelector('dd')?.textContent,'stable');
 });
});


test('recording panel refreshes materialized sources and drops previous media on retarget', async () => {
  const { RecordingPlaybackPanel } = await import('@cyberwave/react');
  let pending = true;
  const start = 1_780_000_000_000_000;
  const client = createCyberwave({ fetch: async request => {
    if ((request as Request).url.includes('/other/')) return new Promise<Response>(() => {});
    return pending
      ? Response.json({ detail: 'Preparing media', retry_after_seconds: 5 }, { status: 202 })
      : Response.json({ items: { twin_data: { robot: { camera: { format: 'mp4', signed_url: 'https://media.example.com/video.mp4', first_timestamp_us: start, last_timestamp_us: start + 1e6 } } }, twin_uuids: ['robot'], is_combined: false, start_timestamp_us: start, end_timestamp_us: start + 1e6 } });
  } });
  const recording = { uuid: 'recording', metadata: { session_name_defined_by_user: 'A recording' } } as any;
  const resolveUrl = () => '/authorized-media';
  const view = (environmentUuid: string) => h(CyberwaveProvider, { client, children: h(RecordingPlaybackPanel, { environmentUuid, recording, resolveUrl }) });
  await mounted(async ({ render, element, click }) => {
    await render(view('env'));
    assert.match(element.textContent!, /Preparing media/);
    assert.equal(element.querySelector('video'), null);
    pending = false; await click('Refresh playback sources');
    assert.equal(element.querySelector('video')?.getAttribute('src'), '/authorized-media');
    await render(view('other'));
    assert.equal(element.querySelector('video'), null, 'Previous environment media is detached immediately');
    assert.match(element.textContent!, /Loading playback/);
  });
});

function datasetSample(uuid: string, extra: Record<string, unknown> = {}) {
  return {
    uuid, attachment_uuid: `attachment-${uuid}`, source_sha256: 'a'.repeat(64),
    source_changed: false, file_url: null, annotations: [], provenance: {},
    review_status: 'pending', revision: 1, created_at: '2026-10-11T08:00:00Z',
    reviewed_at: null, reviewed_by_uuid: null, ...extra,
  };
}

test('sample browser follows opaque numeric cursors, goes back and restarts an approved filter', async () => {
  const { DatasetSampleBrowser } = await import('@cyberwave/react');
  const requests: URL[] = [], selected: string[] = [];
  const client = createCyberwave({ fetch: async request => {
    const url = new URL((request as Request).url); requests.push(url);
    if (url.searchParams.get('approved_only') === 'true') return Response.json({ items: [], next_after: null });
    const after = url.searchParams.get('after');
    return Response.json({ items: [datasetSample(after ? 'second-sample' : 'first-sample')], next_after: after ? null : 57 });
  } });
  await mounted(async ({ render, click, element }) => {
    await render(h(CyberwaveProvider, { client, children: h(DatasetSampleBrowser, { datasetId: 'collection', onSelect: value => selected.push(value.uuid) }) }));
    await click('first-sample'); assert.deepEqual(selected, ['first-sample']);
    await click('Next samples'); assert.equal(requests.at(-1)?.searchParams.get('after'), '57');
    assert.match(element.textContent!, /second-sample/); assert.doesNotMatch(element.textContent!, /first-sample/);
    await click('Previous samples'); assert.equal(requests.at(-1)?.searchParams.has('after'), false);
    await click('Next samples');
    await act(async () => (element.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    assert.equal(requests.at(-1)?.searchParams.has('after'), false);
    assert.equal(requests.at(-1)?.searchParams.get('approved_only'), 'true');
    assert.match(element.textContent!, /Page 1/); assert.match(element.textContent!, /No visible samples/);
    assert.equal(requests.every(url => url.searchParams.get('limit') === '12'), true);
  });
});

test('sample browsing cancels delayed pages and drops cursor state on collection or account changes', async () => {
  const { DatasetSampleBrowser } = await import('@cyberwave/react');
  const requests: Request[] = [];
  let finish: (response: Response) => void = () => {};
  const client = createCyberwave({ fetch: async request => {
    requests.push(request as Request);
    const url = new URL((request as Request).url);
    if (url.searchParams.has('after')) return new Promise<Response>(resolve => { finish = resolve; });
    return Response.json({ items: [datasetSample(url.pathname.includes('/first/') ? 'old-evidence' : 'new-evidence')], next_after: 42 });
  } });
  const next = createCyberwave({ baseUrl: 'http://localhost:8008', fetch: async request => {
    requests.push(request as Request); return Response.json({ items: [], next_after: null });
  } });
  const view = (value: typeof client, datasetId: string) => h(CyberwaveProvider, { client: value, children: h(DatasetSampleBrowser, { datasetId, onSelect() {} }) });
  await mounted(async ({ render, click, element }) => {
    await render(view(client, 'first')); await click('Next samples');
    const pending = requests.at(-1)!;
    await render(view(client, 'second'));
    assert.equal(pending.signal.aborted, true);
    await act(async () => { finish(Response.json({ items: [datasetSample('late-old-evidence')], next_after: null })); });
    assert.match(element.textContent!, /new-evidence/); assert.doesNotMatch(element.textContent!, /old-evidence/);
    assert.equal(new URL(requests.at(-1)!.url).searchParams.has('after'), false);
    await click('Next samples'); await render(view(next, 'second'));
    assert.equal(new URL(requests.at(-1)!.url).searchParams.has('after'), false);
    assert.doesNotMatch(element.textContent!, /new-evidence|old-evidence/);
  });
});

test('sample errors allow explicit retry, changed media stays hidden, and host locks prevent selection', async () => {
  const { DatasetSampleBrowser } = await import('@cyberwave/react');
  let requests = 0, selections = 0;
  const client = createCyberwave({ fetch: async () => ++requests === 1
    ? Response.json({ detail: 'Access denied to this collection' }, { status: 403 })
    : Response.json({ items: [datasetSample('changed-sample', { source_changed: true, file_url: 'https://example.invalid/private-changed-source.png' })], next_after: null }) });
  const view = (disabled = false) => h(CyberwaveProvider, { client, children: h(DatasetSampleBrowser, { datasetId: 'collection', disabled, onSelect() { selections++; } }) });
  await mounted(async ({ render, click, element }) => {
    await render(view()); assert.match(element.textContent!, /cannot access this resource/); assert.doesNotMatch(element.textContent!, /No visible samples/);
    await click('Refresh samples'); assert.match(element.textContent!, /Source changed/);
    assert.equal(element.querySelector('img'), null);
    await render(view(true));
    assert.equal(Array.from(element.querySelectorAll('button')).every(button => button.disabled), true);
    assert.equal((element.querySelector('input') as HTMLInputElement).disabled, true);
    await act(async () => (element.querySelector('.cw-sample-row') as HTMLButtonElement).click());
    assert.equal(selections, 0);
    await render(view()); await click('changed-sample'); assert.equal(selections, 1, 'Host can inspect metadata for unavailable evidence');
  });
});

test('sample browser blocks repeated cursors and refreshes an existing page after a host review', async () => {
  const { DatasetSampleBrowser } = await import('@cyberwave/react');
  let revision = 1;
  const requests: URL[] = [];
  const client = createCyberwave({ fetch: async request => { requests.push(new URL((request as Request).url)); return Response.json({ items: [datasetSample('sample', { revision })], next_after: 29 }); } });
  const view = (refreshKey: number) => h(CyberwaveProvider, { client, children: h(DatasetSampleBrowser, { datasetId: 'collection', refreshKey, onSelect() {} }) });
  await mounted(async ({ render, click, element }) => {
    await render(view(0)); await click('Next samples');
    assert.match(element.textContent!, /invalid sample cursor/);
    assert.equal(Array.from(element.querySelectorAll('button')).find(button => button.textContent === 'Next samples')?.disabled, true);
    revision = 2; await render(view(1));
    assert.equal(requests.at(-1)?.searchParams.get('after'), '29');
    assert.match(element.textContent!, /revision 2/);
  });
});

test('a delayed camera capture cannot replace a review after the host locks input or the camera stops', async () => {
  const { ImageCapture } = await import('@cyberwave/react/annotation');
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let delivered = 0, stopped = 0, encode: (blob: Blob) => void = () => {};
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() { stopped++; } }] }) } } });
  try {
    await mounted(async ({ render, click, element }) => {
      const win = window as unknown as Window & { HTMLMediaElement: typeof HTMLMediaElement; HTMLCanvasElement: typeof HTMLCanvasElement };
      win.HTMLMediaElement.prototype.play = async () => {};
      win.HTMLCanvasElement.prototype.getContext = (() => ({ drawImage() {} })) as any;
      win.HTMLCanvasElement.prototype.toBlob = callback => { encode = callback as (blob: Blob) => void; };
      const view = (disabled: boolean) => h(ImageCapture, { disabled, onCapture() { delivered++; } });
      await render(view(false)); await click('Start camera');
      Object.defineProperties(element.querySelector('video'), { videoWidth: { value: 32 }, videoHeight: { value: 24 }, readyState: { value: 2 } });
      await click('Capture frame'); await render(view(true));
      await act(async () => encode(new Blob(['pixels'], { type: 'image/png' })));
      assert.equal(delivered, 0);
      await render(view(false)); await click('Capture frame'); await click('Stop camera');
      await act(async () => encode(new Blob(['pixels'], { type: 'image/png' })));
      assert.equal(delivered, 0); assert.equal(stopped, 1);
      assert.equal(Array.from(element.querySelectorAll('button')).find(button => button.textContent === 'Start camera')?.disabled, false);
    });
  } finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});

test('dataset catalog uses server pagination, disables episode datasets and resets on account change', async () => {
  const { DatasetBrowser } = await import('@cyberwave/react');
  const requests: URL[] = [];
  let selected = '';
  const client = createCyberwave({ fetch: async request => {
    const url = new URL((request as Request).url); requests.push(url);
    return Response.json({ datasets: [{ uuid: 'photos', name: 'Reviewed photos', metadata: {sample_collection: true}, visibility: 'private' }, {uuid:'episodes',name:'Robot training',metadata:{},visibility:'private'}], has_more: url.searchParams.get('offset') === '0' });
  } });
  let oldSignal: AbortSignal | undefined;
  let resolve: (response: Response) => void = () => {};
  const delayed = createCyberwave({fetch: request => { oldSignal = (request as Request).signal; return new Promise(done => { resolve = done; }); }});
  const next = createCyberwave({fetch: async () => Response.json({datasets:[],has_more:false})});
  await mounted(async ({render, click, element}) => {
    const view = (value = client) => h(CyberwaveProvider, {client:value, children:h(DatasetBrowser, {collectionsOnly:true, onSelect: item => { selected = item.uuid; }})});
    await render(view());
    assert.equal(Array.from(element.querySelectorAll('button')).find(b => b.textContent?.includes('Robot training'))?.disabled, true);
    await click('Reviewed photos'); assert.equal(selected, 'photos');
    await click('Next datasets'); assert.equal(requests.at(-1)?.searchParams.get('offset'), '12');
    assert.equal(Array.from(element.querySelectorAll('button')).find(b => b.textContent === 'Next datasets')?.disabled, true);
    await render(view(delayed)); await render(view(next));
    assert.equal(oldSignal?.aborted, true);
    await act(async () => resolve(Response.json({datasets:[{uuid:'secret',name:'Old account secret'}],has_more:false})));
    assert.doesNotMatch(element.textContent!, /Old account secret|Reviewed photos/);
    assert.match(element.textContent!, /Page 1/);
  });
});

test('model catalog has look-ahead pagination and keeps unavailable models discoverable', async () => {
  const { ModelBrowser } = await import('@cyberwave/react');
  const requests: URL[] = [];
  let selected = '';
  const client = createCyberwave({fetch: async request => {
    const url = new URL((request as Request).url); requests.push(url);
    const offset = Number(url.searchParams.get('offset'));
    return Response.json(Array.from({length:offset ? 1 : 13}, (_, index) => ({uuid:`model-${offset+index}`,name:`Named model ${offset+index}`, can_take_image_as_input:true, model_provider_name:'Provider',deployment:'cloud',inference_issue: 'Credential required'})));
  }});
  await mounted(async ({render, click, element}) => {
    await render(h(CyberwaveProvider, {client,children:h(ModelBrowser,{onSelect:item => {selected=item.uuid;}})}));
    assert.equal(requests[0].searchParams.get('limit'), '13');
    assert.doesNotMatch(element.textContent!, /Named model 12/);
    assert.match(element.textContent!, /Credential required/);
    await click('Next models'); await click('Named model 12'); assert.equal(selected,'model-12');
    assert.equal(Array.from(element.querySelectorAll('button')).find(b => b.textContent === 'Next models')?.disabled,true);
  });
});

test('image task form follows backend task and modality declarations, and does not use custom ports as prompt/image inputs', async () => {
  const { ImageModelTaskControls } = await import('@cyberwave/react/annotation');
  const { modelInputTypes } = await import('@cyberwave/react');
  const model = {uuid:'vision',name:'Vision model',can_take_image_as_input:true,can_take_text_as_input:true,allowed_structured_tasks:['boxes'],required_inputs:[['prompt','image_url']]} as any;
  const action = {id:'boxes',label:'Find boxes',description:'Describe objects in the selected image.',requires_image:true,image_annotation:{kind:'boxes'},default_prompt_template:'Inspect {target} using backend coordinates.'} as any;
  await mounted(async ({render,element}) => {
    const view = (selected = model, disabled = false) => h(ImageModelTaskControls,{model:selected,actions:[action,{...action,id:'not-advertised',label:'Forbidden task'}],actionId:'boxes',onActionChange(){},prompt:'',onPromptChange(){},imageName:'Selected evidence',disabled});
    await render(view());
    assert.match(element.textContent!, /Image required: Selected evidence/);
    assert.match(element.textContent!, /Inspect \{target\}/);
    assert.doesNotMatch(element.textContent!, /Forbidden task/);
    assert.ok(element.querySelector('textarea'));
    await render(view(model,true)); assert.equal(element.querySelector('textarea')?.disabled,true);
    await render(view({...model,can_take_image_as_input:false}));
    assert.equal(element.querySelector('textarea'),null); assert.match(element.textContent!, /does not accept images/);
    const custom = {...model,io_schema:{inputs:[{name:'recording',type:'video',required:true}]}};
    assert.deepEqual(modelInputTypes(custom),['video']);
    await render(view(custom)); assert.equal(element.querySelector('textarea'),null);
    assert.match(element.textContent!, /recording.*video.*required/);
    assert.match(element.textContent!, /custom-model transport/);
  });
});
