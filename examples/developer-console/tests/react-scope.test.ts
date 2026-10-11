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
