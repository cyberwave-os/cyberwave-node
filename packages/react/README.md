# React components for Cyberwave

This reference describes the development branch. Build the [SDK checkout](../../README.md#run-the-examples) before importing it; the examples do not imply that these exports are available in the current npm release. React 18.3 or 19 is a peer dependency. A React framework's interactive boundary must run on the client.

The client owns HTTP transport. Your application owns sign-in, session refresh, selected workspace and persistence decisions. Keep one stable `CyberwaveClient` per session and replace it when changing origin/account. Do not create a new client during every render.

## Imports and styling

| Entry | Exports / role | Setup |
| --- | --- | --- |
| `@cyberwave/react` | Browsers, workflows, inspection/results, recording and sensor telemetry | React plus `CyberwaveProvider` for provider-backed components below |
| `@cyberwave/react/video` | `SensorVideoPanel`, `VideoStream`, `useVideoStream` | Provider, browser WebRTC, backend signaling and an active producer |
| `@cyberwave/react/annotation` | `ImageAnnotationEditor`, `ImageCapture`, `CapturedFrameReview`, `ModelResultOverlay`, capture/model helpers | Browser image/canvas; Annotorious loads when needed. API helpers take a client explicitly. |
| `@cyberwave/react/gis` | `LocationMap` | Optional `cesium` peer, widget CSS, static assets and `CESIUM_BASE_URL` |
| `@cyberwave/react/styles.css` | Optional common visual styles, `--cw-*` tokens | Import once in the application |
| `@cyberwave/react/annotation.css` | Annotation editor styles | Also import when using the editor or frame review |

The main React entry does not load the optional map or annotation editor. GIS setup is in the [GIS guide](../../docs/gis-operations.md#add-the-optional-map). Native hooks and components are also usable with your application's surrounding layout/styles; the SDK does not install a router, login system or global query cache.

## Choose a component

“Provider” means wrap in `CyberwaveProvider client={client}`. “Client prop” means pass `client` directly; adding a provider alone does not supply it to that component. Display-only components need neither.

| Component / hook | Connection | Input and responsibility |
| --- | --- | --- |
| `ConnectionPanel` | Host callbacks | `onConnect({baseUrl, token})`, optional `onDisconnect`; renders the form and errors. It does not create a session or authenticate on its own. |
| `EnvironmentBrowser`, `AssetBrowser` | Provider | Search/pagination; controlled `selectedId`, `onSelect`; optional `resolveResource` for thumbnails. |
| `useEnvironment` / `EnvironmentSummary` | Provider / display | Load one environment snapshot and show loaded objects/warnings. Mount the hook after choosing a non-empty ID. |
| `DatasetBrowser` / `ModelBrowser` | Provider | Select visible datasets/models by name, paginate, filter the current page, inspect compatibility. UUID stays available on each row. |
| `ModelInputSummary` | `model` prop | Display backend input modalities, required groups or custom `io_schema` ports. |
| `DatasetSampleBrowser` | Provider | `datasetId`, controlled selection, cursor pages, approved filter, authorized thumbnails; `disabled` locks browsing and `refreshKey` reloads after a host save. |
| `RecordingBrowser` | Provider | `environmentUuid`, selection and cursor pagination. |
| `RecordingPlaybackPanel` | Provider | `environmentUuid`, `recording`, optional stable `resolveUrl`; track selection, materialization, refresh and playback errors. |
| `useRecordingPlayback` / `RecordingVideo` | Provider / display | Custom playback layout; video emits media-relative seconds. Source clocks remain separate. |
| `SensorSelector` | Display | `twin`, `value`, `onChange`, optional `videoOnly`; projects resolved capabilities. |
| `SensorVideoPanel` | Provider | `twin`, source/instance, optional stable ICE configuration and `onCapture`; explicit Watch/Stop/Reconnect. |
| `VideoStream` / `useVideoStream` | Provider | Exact `target` and `enabled`; lower-level player/hook. Enabled defaults to true, so the host must gate mounting or set false until watching is intended. |
| `SensorTelemetryPanel` / `useSensorTelemetry` | Provider | Twin/sensor IDs plus ISO `start`/`end`; bounded persisted history. |
| `LiveSensorTelemetryPanel` / `useLiveSensorTelemetry` | Provider + host transport | Exact twin/sensor/channel and topic prefix; latest sample, freshness, pause/resume. Transport owns broker permissions and delivery. |
| `WorkflowCatalog` | Client prop | Environment or workspace scope; catalog, template selection, planner and monitor. `readOnly` defaults true. |
| `WorkflowPlanner` | Client prop | Selected workflow and scope, configuration callbacks; explicit edits, scheduling and runs. `readOnly` defaults true. |
| `WorkflowMonitor` | Client prop | Workflow history, selected run and backend status; cancellation only when editing is enabled. |
| `EvidenceCollectionBrowser` / `useEvidenceCollection` | Provider | Environment and collection selection; paginated list and cancellable detail. |
| `EvidenceRecordList`, `EvidenceRecordDetails` | Display | `collection` or `record`; selection, source evidence, uncertainty and revisioned review. Details accept children for application actions/media. |
| `EvidenceVerificationPanel` | Client prop | Environment/subject, baseline review, severity/priority; evidence-backed review. `readOnly` defaults true. |
| `ActivityResults`, `MeasurementCard` | Display | Host-provided `ActivityResult` projections, controlled selection and detail children. No result persistence or threshold inference. |
| `EvidencePreview` | Display | Authorized `src`, kind, caption and unavailable reason; native image/video/audio. Opaque IDs need a host resolver. |
| `LocationMap` | Display + Cesium | Stable `locations`, `selectedId`, `onSelect`, optional stable imagery factory. Read-only site markers and accessible buttons. |
| `ImageAnnotationEditor` | Display | Image source, controlled annotations, validity callback; explicit host saves. |
| `ImageCapture` / `captureVideoFrame` | Browser media | Explicit local camera capture or existing video pixels; no automatic upload. |
| `CapturedFrameReview` | Host callback | Frame, editable labels and cancellable `onConfirm`; host chooses dataset/upload policy. |
| `ModelResultOverlay` | Display | Image, backend structured task and validated canonical result; drawing does not approve labels. |

Discover declared sensors with `twinSensors`. Load model tasks with `loadImageModelTasks`; `runImageModelTask` and `waitForImageModelTask` submit/monitor through existing backend APIs. These helpers and lower-level `connectVideo` are documented in the [custom UI guide](../../docs/custom-ui.md) and [annotation guide](ANNOTATION.md).

## Copy a complete composition

The [checked camera → capture → review recipe](../../examples/developer-console/src/recipes/camera-review.tsx) includes imports, provider, scoped state and an explicit application handoff. It is compiled with the examples and makes no requests on import. Copy it into your application; `CameraReview` is example code, not an SDK export.

Pass a `sessionKey` that changes when the API/account is replaced, the chosen twin/source/run and an `onConfirm` handler. The handler receives the **captured** target identity with the pixels/labels. It can upload an Attachment and append an existing Dataset sample through your server; it must preserve accepted IDs after partial failure and honor cancellation. Cancelling browser waiting does not undo a completed upload. Keep ICE/transport/resolver objects stable while their configuration is unchanged.

The complete pages also demonstrate [environment/model loading](../../examples/developer-console/src/environment-browser.tsx), [stored inspection drill-down](../../examples/developer-console/src/inspection-atlas.tsx) and [workflow planning](../../examples/developer-console/src/workflow-workbench.tsx).

## Selection, scope and empty states

Let the host own selected IDs and URL routing. When an API/account/environment changes, clear dependent selections and drafts before showing the new scope. Resource hooks discard stale results; browsers reset internal pagination. These guarantees do not reset application-owned notes, annotations or execution IDs. Key the corresponding application subtree to its session/resource identity, as the camera recipe does.

A selected sensor may have no active producer. An environment may have no recordings, geo anchor or campaigns. A finalized recording may lack a supported MP4 track. Render these as distinct states; do not insert synthetic readings into an API response. For finite history preserve the explicit time window and pagination cursor/offset. A recording's microseconds, video seconds and telemetry event/arrival times are different clocks.

Read-only defaults apply to workflow/verification mutations, not to every API operation. Viewing video negotiates a session; clicking a host-provided confirmation can write evidence; selecting a resource is not command authorization. The backend remains authoritative. The example gateway's localhost restrictions are demonstration policy, not limitations hardcoded into SDK components.

## Extending the experience

The [component opportunities](../../docs/component-opportunities.md) prioritize target selection, human actions, sample upload handoff and evidence comparison from the current examples. Proposed names there are not shipped exports. Prefer composing or extracting existing components before adding another public abstraction.


## Pick datasets and models by name

```tsx
import { DatasetBrowser, DatasetSampleBrowser, ModelBrowser } from '@cyberwave/react';
// All three live inside your CyberwaveProvider.
<DatasetBrowser collectionsOnly selectedId={dataset?.uuid} onSelect={setDataset} />
{dataset && <DatasetSampleBrowser datasetId={dataset.uuid} onSelect={setSample} />}
<ModelBrowser selectedId={model?.uuid} onSelect={setModel} />
```

These components wrap the existing generated `datasets.list` and `mlmodels.list` APIs. They request bounded pages of 12 (models use one extra row to detect the next page); they never download the entire catalog. The name/UUID filter is explicitly **current-page only** because those endpoints do not advertise server-side search. Selection is controlled by the host. `disabled` locks navigation and selection. Changing the provider client clears the catalog and cancels stale reads.

`DatasetBrowser` can browse all visible datasets; `collectionsOnly` disables episode datasets while retaining their explanation. Media collections use `metadata.sample_collection`, as declared by the backend. Examples 14 and 15 share a named collection picker with optional direct UUID entry.

`ModelBrowser` shows provider, deployment and accepted input types. `ModelInputSummary` honors `io_schema` before legacy flags and shows required named ports or AND/OR input requirements. Model task declarations do not imply a runnable transport or configured credentials. Use [ImageModelTaskControls](ANNOTATION.md#select-a-model-and-its-inputs) for structured image tasks; custom audio/video/named-port execution needs the platform's corresponding model adapter.

## Browse dataset evidence

`DatasetSampleBrowser` is used by [human evidence](../../examples/developer-console/src/human-evidence.tsx) and [image annotation](../../examples/developer-console/src/image-annotation.tsx). It pages the existing `datasets.samples` API in groups of 12, following the returned `next_after` cursor. The approved filter runs on the backend; source-integrity errors remain visible. It does not infer collection totals, approve labels, upload files or create collections.

```tsx
// Inside CyberwaveProvider; the host owns the selected sample and review draft.
<DatasetSampleBrowser
  datasetId={datasetId}
  selectedId={sample?.uuid}
  onSelect={setSample}
  resolveResource={resolveAuthorizedMedia}
  disabled={saving || hasUnsavedLabels}
  refreshKey={reviewVersion}
/>
```

`resolveResource` optionally maps a returned media URL to your authorized proxy. Changed sources never load a thumbnail. Missing or failed media remains selectable for metadata inspection; the host must block review/inference for unavailable bytes. Thumbnails are image previews, not calibrated overlays.

Changing the provider client or `datasetId` cancels the old request and resets internal filter/cursors. Clear the host's selected sample/draft at the same boundary. `refreshKey` reloads the **current page**, preserving its filter; it does not update an application-owned selected record. After saving, retain the returned sample/revision and increment this key. Set `disabled` while a save or dirty review must prevent navigation. This locks controls, not authorization; a parent scope change still cancels old reads.

The annotation example compares actual labels/geometry, treating absent/null polygons and floating-point round trips equivalently. It requires an explicit save or discard before changing images. The cross-example link carries the collection UUID only; select the intended sample again. It does not scan every page to resolve a sample deep link or transfer drafts through browser storage.
