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
| `InspectionCampaignBrowser` / `useInspectionCampaign` | Provider | Environment and campaign selection; paginated list and cancellable detail. |
| `InspectionObservationList`, `InspectionObservationDetails` | Display | Campaign or observation; selection, source evidence, uncertainty and revisioned review. Details accept children for application actions/media. |
| `InspectionVerificationPanel` | Client prop | Environment/defect, baseline review, severity/priority; evidence-backed review. `readOnly` defaults true. |
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

The [component opportunities](../../docs/component-opportunities.md) prioritize target selection, sample browsing, human actions and evidence comparison from the current examples. Proposed names there are not shipped exports. Prefer composing or extracting existing components before adding another public abstraction.
