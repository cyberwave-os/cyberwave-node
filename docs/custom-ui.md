# Build a custom Cyberwave interface

This guide describes the CYB-4234 branch, before npm publication. Build the checkout as described in the [README](../README.md). Video session routes and the telemetry `sensor_id` filter also require this backend increment; production may not have them yet.

Start with an application-owned session and one `createCyberwave` client per API/account. Reuse the backend's environment, twin, sensor, workflow, execution and dataset identities. A customer-specific screen is a composition of these resources, not another domain model.

## Pick the smallest presentation layer

| Need | Reuse | Runnable example |
| --- | --- | --- |
| Map assets and drill into activities | `LocationMap`, `ActivityResults`, `MeasurementCard`, `EvidencePreview` | [18 · Asset operations](http://127.0.0.1:5173/asset-operations.html) |
| Browse stored inspection history | `InspectionCampaignBrowser`, `useInspectionCampaign`, observation list/details | [19 · Inspection atlas](http://127.0.0.1:5173/inspection-atlas.html) |
| Browse environments and load real objects | `EnvironmentBrowser`, `loadEnvironment`, optional `@cyberwave/environment-3d` | [01 · Environments](http://127.0.0.1:5173/environments.html) |
| Show a live or simulation camera | `twinSensors`, `connectVideo` or `VideoStream` | [16 · Sensor video](http://127.0.0.1:5173/sensor-video.html) |
| Inspect stored samples from one sensor | `twins.telemetry`, `useSensorTelemetry`, `SensorTelemetryPanel` | [17 · Sensor telemetry](http://127.0.0.1:5173/sensor-telemetry.html) |
| Receive sensor packets immediately | `subscribeSensorTelemetry` with a host-owned subscription transport | Live panel in [17 · Sensor telemetry](http://127.0.0.1:5173/sensor-telemetry.html) |
| Review an existing recording | `RecordingBrowser`, `RecordingPlaybackPanel` (or the playback hook/player) | [10 · Recording review](http://127.0.0.1:5173/recording-review.html) |
| Select models and understand their inputs | `ModelBrowser`, `ModelInputSummary`, `ImageModelTaskControls`, backend task catalog | [15 · Capture & annotation](http://127.0.0.1:5173/image-annotation.html) |
| Browse and select dataset evidence | `DatasetBrowser`, `DatasetSampleBrowser`, `datasets.list`, `datasets.samples`, host-owned review selection | [14 · Human actions & evidence](http://127.0.0.1:5173/human-evidence.html) and [15 · Capture & annotation](http://127.0.0.1:5173/image-annotation.html) |
| Capture and annotate evidence | `captureVideoFrame`, `ImageAnnotationEditor`, backend ML task schemas, `datasets` | [15 · Capture & annotation](http://127.0.0.1:5173/image-annotation.html) |
| Plan and monitor work | `WorkflowCatalog`, `WorkflowPlanner`, `WorkflowMonitor` | [11 · Workflows & schedules](http://127.0.0.1:5173/mission-library.html) |
| Request human input and resume a run | Existing human-action endpoints and dataset samples | [14 · Human actions & evidence](http://127.0.0.1:5173/human-evidence.html) |
| Send operator intent | Existing controller policy and backend validation | [07 · Keyboard telecontrol](http://127.0.0.1:5173/keyboard-telecontrol.html) |

Local links need `pnpm server` and `pnpm dev`. All 19 examples share the API header and a grouped dropdown. The header defaults to `https://api.cyberwave.com`; custom HTTPS APIs and local HTTP APIs are supported. Video negotiation is a POST: the development BFF permits it only for authenticated local APIs. Other API operations and controller targets retain their existing restrictions.

## Authentication and application boundaries

`createCyberwave({ baseUrl, getToken })` calls your token provider for each request. It does not implement sign-in, token refresh, cookies, role selection or account switching. In a browser, use your application's BFF or a permitted user token with API CORS configured. Never expose a service account token in a frontend bundle. The example BFF keeps its token in an HttpOnly-cookie-backed in-memory session and must remain loopback-only.

The React `CyberwaveProvider` shares that client. Create a new client and clear selected resources when the API, workspace or account changes. Abort in-flight reads and close video/subscriptions before replacing credentials. The example gateway rejects stale connection revisions so another tab cannot silently retarget a request.

Read authorization is checked on the backend for twin discovery, history and video negotiation. The video bridge uses backend MQTT credentials internally; viewers do not need MQTT publish privileges. Starting a producer, starting a simulation, moving a robot, running a workflow and writing evidence are separate actions with their existing permissions. Merely selecting **Simulation** selects an already-publishing source.

## Discover sensors from backend capabilities

```ts
import { twinSensors } from 'cyberwave';

const twin = await client.twins.get(twinUuid, { signal });
const sensors = twinSensors(twin); // { id, name, type }[]
// Render sensors and preserve the exact selected id.
```

The backend already resolves asset inheritance and legacy aliases into `twin.capabilities.sensors`. Do not maintain a second camera/IMU schema registry in your UI. An empty catalog means no declared sensors; it does not prove that the device is offline. Catalog membership also does not prove that a producer is currently publishing.

## Receive video without controlling the device

```ts
import { connectVideo } from 'cyberwave/video';

const abort = new AbortController();
const viewer = await connectVideo(client, {
  twinUuid,
  sensorId,
  streamSource: 'live',           // or 'simulation'
  streamInstanceId: 'default',    // use the publishing instance's actual ID
  kind: 'rgb',                    // or 'depth', if the producer supports it
}, { signal: abort.signal, rtcConfiguration });
video.srcObject = viewer.stream;
// The host video element should use autoplay, muted and playsInline.
// On navigation, source change or sign-out:
await viewer.close();
video.srcObject = null;
```

`connectVideo` creates a receive-only WebRTC peer, gathers ICE, sends one authenticated HTTP offer and consumes the returned SDP answer. The media flows directly between the SFU and the browser. `rtcConfiguration` accepts your deployment's STUN/TURN configuration; the SDK contains no relay credentials. Use HTTPS outside localhost and ensure the SFU's advertised address and UDP/TURN connectivity are reachable. Importing the optional entry point is SSR-safe; call it only in a browser.

The default connection deadline is 30 seconds. Once an HTTP offer has been submitted, cancellation immediately closes the local peer but retains the bounded HTTP response so a late server session can be released. A custom `fetch` must honor request signals. Negotiation is never automatically resubmitted. `interrupted` means the connection or track was interrupted; the SDK does not initiate a new session automatically. A connected peer with an incoming track can still be waiting for its first decoded frame.

The returned close handle is signed and bound to the authenticated user, twin and session. It can only close that consumer, including after the owner's read grant is revoked. Release is best effort; it does not stop the producer or recording. If explicit `close()` fails at the HTTP layer, it can be retried without creating another viewer. A browser crash, expired credentials, API retarget or lost HTTP response may prevent teardown. This increment does not add a durable viewer registry or lease; applications should stop before reconnecting the API and operators should monitor SFU consumers.

For React:

```tsx
import { CyberwaveProvider } from '@cyberwave/react';
import { VideoStream } from '@cyberwave/react/video';
import '@cyberwave/react/styles.css';

<CyberwaveProvider client={client}>
  <VideoStream
    target={{ twinUuid, sensorId, streamSource: 'simulation', streamInstanceId }}
    enabled={watching}
    rtcConfiguration={stableRtcConfiguration}
    ref={videoRef}
  />
</CyberwaveProvider>
```

`VideoStream` cleans up on source/client changes and unmount. Memoize RTC configuration. For a fully custom player use `useVideoStream` and attach its `stream` to your own video element. It returns `status`, `stream` and `error`; it does not impose a toolbar, layout or controller policy.

| Result | UI action |
| --- | --- |
| 401 / 403 | Restore the application session or explain missing read access. |
| 404 | Check the twin UUID and whether this backend increment is deployed. |
| 405 from the example gateway | Connect to an authenticated local API; the demo does not allow remote POSTs. |
| 409 from video negotiation | No matching producer; check sensor, source, instance and kind before retrying. |
| 502 / 504 | Negotiation failed or signaling timed out; check backend/SFU/broker health. |
| Connected, no pixels | Check producer output and codec compatibility; capture waits for decoded pixels. |
| Interrupted | Show stale/unavailable media and offer explicit Stop / Watch again. |

## Stored history versus live samples

```ts
const page = await client.twins.telemetry(twinUuid, {
  start: '2026-10-10T10:00:00Z', end: '2026-10-10T11:00:00Z',
  sensor_id: sensorId, limit: 20, offset: 0, order: 'desc',
}, { signal });
```

The server applies the exact sensor filter before sorting, counting and pagination. Only rows whose `metadata.sensor_id` matches are included. Older untagged data remains available through a twin-wide query, but must not be labeled as a particular sensor. The SDK rejects mixed results from an older backend that ignores the filter. An empty response alone cannot establish whether an older backend supports filtering.

`SensorTelemetryPanel` uses an explicit ISO time window and manual refresh, with 20 samples per page. `useSensorTelemetry` exposes the same data for custom tables/charts. Sample metadata stays in the producer's format; apply the device schema's units rather than guessing. Offset pagination is appropriate for a bounded review window; late-arriving rows can still move offsets. The example never claims replay-complete or lossless history.

For live views, inject an authenticated `SensorTelemetryTransport`:

```ts
import { subscribeSensorTelemetry } from 'cyberwave';

const stop = await subscribeSensorTelemetry(transport, {
  twinUuid, sensorId, channel: 'imu', topicPrefix: 'local',
}, sample => renderSample(sample.payload), abort.signal);
// stop() is idempotent; abort also releases the subscription.
```

The transport implements `subscribe(topic, onMessage): Promise<unsubscribe>`. Your host owns the broker WebSocket URL, authentication, reconnection and decoding. Resolve only after successful subscription acknowledgment, reject denied subscriptions, bound payload sizes, decode JSON and remove only that listener when unsubscribing. If several views share a broker topic, reference-count its broker subscription so closing one view does not unsubscribe the others. Do not forward API tokens to arbitrary brokers selected by page input.

The helper uses an exact topic, rejects wildcard channels and emits only object packets with a matching `sensor_id`, `sensor` alias, or `data.sensor_id` on `depth_data` packets. Conflicting identities are rejected. It does not parse binary packets or attribute unlabeled packets to a sensor. Prefix `local` means `localcyberwave/twin/...`; production uses no prefix. Channels such as `imu`, `gps` or `telemetry` depend on the producer: sensor type alone is not a channel-discovery API. `receivedAt` is browser arrival time in milliseconds, not calibrated capture time. Bound buffers and throttle chart rendering in your application. Live subscription does not cause persistence.

## Recordings, capture and evidence

Use example 10 to discover finalized recordings and refresh expiring playback URLs. Use the same `captureVideoFrame(videoRef.current)` helper on a recording, a WebRTC stream or a local camera. It returns PNG bytes, pixel dimensions, media-relative seconds and browser capture time. No upload occurs. Cross-origin recorded media needs CORS for canvas capture.

The captured image can enter the existing [annotation and model-task flow](../packages/react/ANNOTATION.md): backend task catalog → canonical results → human review → dataset sample with source hash and revision. Keep twin/sensor/source/recording identity in evidence provenance. Store stable IDs instead of signed playback URLs. Automatic segmentation comes from a supported model task; manually drawing polygons does not run a model.

Video playback time, telemetry event time, recording catalog microseconds and browser arrival time are different clocks. Frame-accurate overlays, sensor fusion and synchronized 3D replay need source timing/SEI and an explicit clock adapter. The SDK does not invent alignment.

## Styling, accessibility and independent commands

React styles are optional. Scope overrides to your application shell:

```css
.customer-console {
  --cw-bg: #10151d;
  --cw-panel: #172332;
  --cw-accent: #48c2ef;
  --cw-text: #eef4fa;
  --cw-muted: #a2b5c8;
  --cw-border: #33495d;
  --cw-radius: 10px;
}
```

Use hooks for complete layout freedom. Keep visible sensor/source labels, keyboard-accessible selectors, explicit empty/error states and loading announcements. Distinguish stale data from zero values. Retain identity and freshness in widgets even when hiding technical details.

Compose viewing and commands as separate controls. A read-only dashboard needs neither controller input handlers nor command credentials. A dispatch panel can bind existing workflow template inputs, schedule the configured workflow and monitor its execution. A teleoperation view can consume the same video hook while sending bounded intent through an independently authorized controller. Keep simulation preview, backend simulation and physical operation visibly distinct.

## Deployment gaps to plan for

This increment provides reusable viewers and exact sensor history; it does not introduce new media, mission or telemetry stores. Integrations still need deployment-specific ICE/broker configuration, producer activation/availability, crash-resilient viewer cleanup, and adapters for synchronized playback or binary sensor formats. A backend-advertised transport/capability contract would remove more host configuration later. Keep those additions close to existing services rather than duplicating protocols in each UI.

Executable TypeScript composition: [video and sensor recipe](../examples/recipes/video-and-sensors.ts). Full pages: [video source](../examples/developer-console/src/sensor-video.tsx), [telemetry source](../examples/developer-console/src/sensor-telemetry.tsx).

## Compose a camera console and a live sensor panel

Use the opinionated components when the standard interaction is enough; keep the
headless hooks for layouts with different controls.

```tsx
import { CyberwaveProvider, LiveSensorTelemetryPanel } from '@cyberwave/react';
import { SensorVideoPanel } from '@cyberwave/react/video';
import '@cyberwave/react/styles.css';

<CyberwaveProvider client={client}>
  <SensorVideoPanel
    twin={twin}
    streamSource="simulation"
    streamInstanceId={simulationId}
    rtcConfiguration={stableRtcConfiguration}
    onCapture={(frame, target) => reviewLocally(frame, target)}
  />
  <LiveSensorTelemetryPanel
    transport={authenticatedTransport}
    twinUuid={twin.uuid}
    sensorId="depth_camera"
    channel="depth"
    topicPrefix="local"
  />
</CyberwaveProvider>
```

`SensorVideoPanel` provides a catalog-backed sensor selector, explicit Watch,
Stop and Reconnect controls, and a PNG preview/download. Capture stays disabled
until the browser decodes a frame. Switching API client, twin, source or instance
clears the previous view and pending capture. An `onCapture` callback can open your
annotation/review flow; it does not upload evidence automatically. `enabled={false}`
disables viewing. `SensorSelector` is also available separately for controlled forms.

Compose `CapturedFrameReview` from `@cyberwave/react/annotation` after capture:

```tsx
const [capture, setCapture] = useState<{ frame: CapturedFrame; target: VideoTarget }>();

<SensorVideoPanel twin={twin} showCapturePreview={false}
  onCapture={(frame, target) => setCapture({ frame, target })} />
{capture && <CapturedFrameReview frame={capture.frame}
  onConfirm={({ frame, annotations }, signal) =>
    saveReviewedEvidence({ frame, annotations, target: capture.target }, signal)} />}
```

Import `CapturedFrame` from the annotation entry point, `VideoTarget` from
`cyberwave/video`, and `@cyberwave/react/annotation.css`. The review component reuses
`ImageAnnotationEditor` (Annotorious rectangles/polygons and canonical dataset
annotations). It owns the local preview URL, busy/error states and explicit
confirmation. Replacing the frame aborts pending handoff and resets annotations.
The host supplies `saveReviewedEvidence`, honors its abort signal, and chooses the
dataset, ML task, provenance and persistence policy. Keep the captured `target`
snapshot; do not substitute the currently selected sensor when saving older evidence.
Scope the review to the current API client and twin, as the example workbench does.
Example 16 exports the reviewed annotations and PNG locally, with no implicit upload.

`LiveSensorTelemetryPanel` subscribes to one exact channel, shows the latest
sample, an arrival count and staleness, and provides Pause/Resume. Its rendering is
bounded to ten updates per second and it retains only the latest sample. Long
binary strings and arrays are summarized in the UI; the hook's payload remains intact.
Use `useLiveSensorTelemetry` to build a gauge or chart with your own unit labels.
Transport subscription errors are shown. If an established transport ends, the
last arrival becomes stale; pause and resume explicitly to reconnect.

The live helper recognizes the existing `sensor_id` and `sensor` identities, plus
`data.sensor_id` on a `depth_data` envelope. Conflicting identities are rejected.
Older unlabelled depth publishers need an update before exact sensor filtering can
work. Updated simulation producers include `data.stream_instance_id` and mark
the envelope `source_type: "sim"`; preserve these fields with evidence. A sensor match does not assert a simulation-run match: keep your transport
scoped to the intended source/run when multiple producers publish the same topic.

Example 16 uses the camera console. Example 17 now includes a live subscription
alongside stored history. Its development bridge holds local MQTT credentials on
the server, checks twin read access and sensor capabilities, rejects API connection
changes, and closes after five minutes. It does not proxy arbitrary MQTT topics or
publish commands. Production applications should supply their own authenticated
subscription adapter and authorization lifecycle. Live packets are not necessarily
persisted; an empty history panel does not mean a live sensor is offline.

For a local simulation, producer and viewer must agree on **twin + sensor + kind +
source + stream instance**. Use the returned simulation run ID, not `default`.
Check the SFU health endpoint, broker prefix, advertised ICE address and camera
producer logs before retrying a failed viewer. Starting/stopping simulation and
commanding joints remain separate authorized application actions.

## Map assets, activities and inspection evidence

Follow the [GIS operations integration guide](gis-operations.md) for optional Cesium setup, controlled selections, source measurements, missing evidence, existing environment geo anchors and persistent inspection review. Examples 18 and 19 compose the same components used in maintenance and recording review. Display types do not introduce new backend records. The guide distinguishes site locations from finding positions and normal workflow outputs from persistent defects.


## Component reference and complete composition

Use the [React component reference](../packages/react/README.md) for entry points, required provider/client props and ownership boundaries. The [typed camera → capture → review recipe](../examples/developer-console/src/recipes/camera-review.tsx) includes imports, session-scoped state and original capture provenance. It is checked by the examples build. The [component roadmap](component-opportunities.md) distinguishes available pieces from proposed extractions for sample upload handoff, human actions and inspection comparison.
