# Cyberwave developer console

Nineteen examples share the official `cyberwave` client, optional React/3D packages and a Cyberwave-style header. Start them from the [SDK repository root](../../README.md), after `pnpm build`, with `pnpm server` and `pnpm dev`.

## Choose a runnable path

- **No private credentials:** start with 02 (public assets), 18 (synthetic operations), 08 (aerial draft), or 15 (local-image annotation).
- **An authorized environment:** try 01 (3D), 10 (recordings) or 19 (stored inspections). Empty catalogs need actual stored resources; the UI does not seed them.
- **An active sensor producer:** use 16 (video/capture) or 17 (live/history), with the matching local backend and media/broker configuration.
- **Plan and review work:** use 11–15. Mutations require explicit actions and the authenticated local gateway.

Every page has **About this example** below the header. It describes its data source, prerequisites, writes and reusable pieces. The command examples 03–07 use the server-configured target; the API header does not retarget those controls. The catalog below is generated from [the navigation source](src/example-catalog.ts); update it with `pnpm examples:write` at the repository root. The build checks for drift.

<!-- example-catalog:start -->
| Example / source | Data source | Before you start | Actions and persistence |
| --- | --- | --- | --- |
| [01 · Environment explorer](http://127.0.0.1:5173/environments.html) · [source](src/environment-browser.tsx) | API selected in the header | Authorized environment and accessible model resources. | Read-only environment/model loading; scene gestures do not issue commands. |
| [02 · Real asset studio](http://127.0.0.1:5173/asset-catalog.html) · [source](src/environment-browser.tsx) | API selected in the header | Public catalog or authorized private assets; accessible model resources. | Read-only asset loading; joint motion is a local preview. |
| [03 · Cesium GIS & navigation drafts](http://127.0.0.1:5173/) · [source](src/main.ts) | Server fixture or server-configured local target | Fixture mode works without credentials. Connected navigation requires explicit execution and geo-verification settings. | Local route draft; Start can dispatch navigation only when enabled on the server. Header API does not retarget commands. |
| [04 · Twin & camera monitor](http://127.0.0.1:5173/twin-monitor.html) · [source](src/twin-monitor.ts) | Server fixture or server-configured local target | Fixture mode or a configured environment/twin; camera snapshots need an active source. | Read-only REST snapshots. This is not the WebRTC viewer. |
| [05 · Route timeline · kinematic](http://127.0.0.1:5173/mission-simulation.html) · [source](src/mission-simulation.ts) | Server fixture or local API snapshot; local animation | Default fixture, or the server-configured environment. | Play/pause/seek a kinematic route; no backend run or command is created. |
| [06 · Robot environment & runtime modes](http://127.0.0.1:5173/robot-environment.html) · [source](src/robot-environment.ts) | Catalog mesh; server-configured observations and controller | Fixture preview, or local environment/policy/MQTT. Physics start additionally requires a compatible simulation worker. | Explicit controller activation; optional bounded backend simulation start/owned stop. Live selection observes the configured twin. |
| [07 · Keyboard controller input](http://127.0.0.1:5173/keyboard-telecontrol.html) · [source](src/keyboard-telecontrol.ts) | Server fixture or server-configured simulation controller | Fixture preview, or an assigned simulation-only velocity policy and local broker. | Activation + Space/WASD/QE produce bounded intent. Live actuation is not enabled by the API header. |
| [08 · Aerial inspection planning](http://127.0.0.1:5173/aerial-inspection.html) · [source](src/aerial-inspection.tsx) | Synthetic survey; optional API workflow panel | No credentials for planning. Workflow panel needs the matching backend. | Survey export and kinematic preview; no flight upload. Embedded workflow controls are separate real actions. |
| [09 · Campaign & evidence review](http://127.0.0.1:5173/inspection-workbench.html) · [source](src/inspection-workbench.tsx) | Synthetic comparison plus optional API persistence | Local walkthrough; authenticated local inspection API for imports/reviews. | Local review/export or explicit synthetic campaign import and stored review. Local video selection does not upload it. |
| [10 · Recording catalog & playback](http://127.0.0.1:5173/recording-review.html) · [source](src/recording-review.tsx) | API selected in the header | Authorized environment and stored recordings; finalized MP4/known source clock for video. | Catalog/source reads and media playback; HTTP 202 means preparation, not a missing recording. |
| [11 · Workflows & schedules](http://127.0.0.1:5173/mission-library.html) · [source](src/mission-library.tsx) | API selected in the header | Workspace/environment access; workflow templates and preview input-contract/pagination routes. | Local-backend draft/configuration, activation, recurring schedule, run and cancellation. |
| [12 · Maintenance planning](http://127.0.0.1:5173/maintenance-planning.html) · [source](src/maintenance-planning.tsx) | Synthetic proposal plus API findings/workflows | Local proposal needs no private data. Stored findings/workflow planning need an authorized environment. | JSON export is local. The embedded planner can change/run workflows independently; no work order or reservation is submitted. |
| [13 · Maintenance verification](http://127.0.0.1:5173/maintenance-verification.html) · [source](src/maintenance-verification.tsx) | Synthetic reconciliation plus API stored verification | Local walkthrough or stored baseline/follow-up evidence on the preview backend. | Local acceptance exercise; explicit stored review/import and workflow actions can write to the authenticated local API. |
| [14 · Human actions & evidence](http://127.0.0.1:5173/human-evidence.html) · [source](src/human-evidence.tsx) | API selected in the header | Preview human-action and dataset-sample routes; assigned action or a visible media collection. | Explicit consent/acknowledgement writes to authenticated local APIs. Photo upload uses the platform inbox; sample browsing uses backend pagination and an approved-only filter. |
| [15 · Capture & annotation](http://127.0.0.1:5173/image-annotation.html) · [source](src/image-annotation.tsx) | Local image/camera or API dataset sample | Local image works without API credentials. Sample review and model assistance need the matching backend. | Local drawing/export; explicit local-backend review or model run. Inference may consume credits. Choose datasets and models by name, then a sample and backend image task. Save or discard label edits before changing images. |
| [16 · Sensor video](http://127.0.0.1:5173/sensor-video.html) · [source](src/sensor-video.tsx) | API selected in the header and an active camera producer | Authenticated local API, video routes, reachable SFU and exact twin/sensor/source/stream instance. | Explicit viewer negotiation and teardown; PNG/annotation exports stay local. Does not start a producer. |
| [17 · Sensor telemetry](http://127.0.0.1:5173/sensor-telemetry.html) · [source](src/sensor-telemetry.tsx) | API history; optional local MQTT bridge | Stored sensor-tagged events for history. Live reads also need server-configured MQTT and the matching authenticated local API. | REST reads; explicit live subscribe/disconnect. Neither starts a producer nor persists packets. |
| [18 · Asset operations map](http://127.0.0.1:5173/asset-operations.html) · [source](src/asset-operations.tsx) | Invented sites and activity results | No API credentials. Optional OpenStreetMap tiles need network access. | Local selection and JSON export only. |
| [19 · Inspection atlas](http://127.0.0.1:5173/inspection-atlas.html) · [source](src/inspection-atlas.tsx) | API selected in the header | Authorized environment; inspection endpoints and stored campaigns. A geo anchor is optional. | Read-only campaign/review/recording browsing; media references need a host resolver. |
<!-- example-catalog:end -->

## Production, local and custom connections

Open **API** in the header to select production, localhost or a custom origin. The same `ConnectionPanel` serves all nineteen examples; page-level duplicates have been removed. Changing connection reloads the example and clears drafts, selections, models and previews. Export drafts first. Navigation between examples restores the gateway session. **Reset to public** replaces it with an anonymous production session. The page and header share one initialization request so a first visit cannot race two cookie sessions.

The shared API header on every example defaults to `https://api.cyberwave.com`. Connect anonymously for public assets; enter a Cyberwave API token for private environments. Use `http://localhost:8000` or any custom HTTPS API origin for integration testing. Changing origins clears the scene and requires a new credential choice. Tokens stay in the local gateway's memory; storage/model-resource downloads never receive them.

If a server-side `CYBERWAVE_API_TOKEN` is configured for the local gateway's exact origin, the explorer can use it when you explicitly connect to that local origin. It is never used for production or another custom origin. The current API origin and authentication state are shown in the header.

The connection panel configures **browsing, local inspection metadata writes and workflow configuration/execution**. Remote origins remain read-only in this example gateway. Control examples retain their separately configured local environment, target and policy. Selecting production in the explorer never retargets command delivery. A static frontend alone is insufficient: `/gateway` and `/api` need the example BFF. This loopback-only server is a development tool, not a publicly deployable multi-user proxy.

Choose **Unitree Go2** to reproduce production URDF/DAE model loading. No model files or private environment data are bundled. Models are fetched from the selected API's returned resource URLs. Use real local assets/environments to validate project-specific file formats and frame conventions; unsupported visuals are reported in loading notes.

## Connect the command examples to local Cyberwave

Copy `.env.example` to `.env`, select `DEMO_MODE=connected`, and set a loopback API URL (normally `http://localhost:8000`), server-held API token, and environment UUID. The privileged command gateway rejects remote Cyberwave API origins. The separate explorer connection accepts production and custom HTTPS origins. The optional twin allowlist further narrows access. In the Cyberwave monorepo, use `make backend` to start a local backend when needed. Restart `pnpm run server` after configuration changes.

The token stays on the server and never enters `VITE_*` variables or browser responses. The BFF binds only to loopback and accepts the example's local browser origin. It has no partner login or production session management; a public deployment needs the authentication and authorization work described in the root SDK README.

The app reads twins and saved waypoints, polls REST snapshots/action status, and displays an authenticated latest-camera-frame image. Relative waypoint frames are omitted pending explicit server resolution. Example 04 uses camera snapshots. Example 16 provides a separate receive-only WebRTC viewer through the authenticated backend signaling bridge.

Navigation execution is disabled by default. To use the explicit Start button with an authorized device, set `CYBERWAVE_ALLOW_EXECUTION=true` and verify calibration before setting `DEMO_GEOREF_VERIFIED=true`. Cyberwave validates the target and navigation request at dispatch. Cancel submits a cancellation request, without claiming an immediate physical stop.

## Custom controller input and 3D integration

The keyboard and 3D examples share `mountKeyboardController`, a UI composition controller. The 3D renderer accepts pose snapshots and has no command/API dependency. The keyboard layout, forward pulse, and one-second arc all use the same input adapter. Hold Space and W/S to move, A/D to strafe, Q/E to turn; release Space, blur, or Stop input to submit zero velocity.

Fixture mode uses a local kinematic reference consumer. For a real **local Cyberwave MQTT transport**, configure:

```dotenv
DEMO_MODE=connected
CYBERWAVE_API_URL=http://localhost:8000
CYBERWAVE_API_TOKEN=<server-held local session or API token>
CYBERWAVE_ENVIRONMENT_UUID=<authorized local environment>
CYBERWAVE_CONTROLLER_TWIN_UUID=<twin in that environment>
CYBERWAVE_CONTROLLER_UUID=<policy assigned to that twin>
DEMO_CONTROLLER_TRANSPORT=mqtt
DEMO_MQTT_URL=mqtt://127.0.0.1:1883
DEMO_MQTT_ENVIRONMENT_PREFIX=local
```

The assigned policy must declare `execution_contract: locomotion.velocity_command.v1`, `runtime_kind: simulation`, `physical_enabled: false`, finite positive `max_linear_x` / `max_angular_z`, and `max_linear_y` when lateral motion is supported. The example caps input at 0.5 m/s and 0.8 rad/s. It rejects physical policies, arbitrary browser-selected targets/topics, and changing policy revisions. `preview` transport also supports connected data without broker publishing.

The server compiles allowed key codes into the existing packet accepted by the simulation controller: `source_type: sim_tele`, `command: locomotion_velocity`, and `data.contract: locomotion.velocity_command.v1`. It publishes to `localcyberwave/twin/{uuid}/command` with 300 ms duration, QoS 0, retain false, no reconnect/replay queue. It subscribes to its exact topic, consumes only its own session-tagged packets, and drives a separate reference pose from actual broker echoes. Delivery/echo is not acknowledgment of physical execution.

Server-held MQTT credentials default to the API token with the `cwh_<SHA256(token)>` broker identity supported by current `dev`. Older local brokers may require explicit `DEMO_MQTT_USERNAME` and `DEMO_MQTT_PASSWORD`. They never enter browser bundles. [MQTT.js transport options](https://github.com/mqttjs/MQTT.js).

Inputs have monotonically increasing sequence numbers and a freshness bound. One input session owns the configured target; the BFF periodically rechecks authorization/policy off the latency-sensitive input path and closes stale sessions. Release messages bypass motion throttling. Browser loss expires the reference consumer and the server submits a zero input. Real controller/driver runtimes must enforce their own TTL/watchdog; a loopback example lease is not cross-application arbitration or a hardware emergency stop.

In the 3D page, **Simulation** activates the simulation-only controller and shows its reference consumer's pose. **Live** first releases/closes that input session, then shows the configured twin's observed REST position. Live actuation remains unavailable for a simulation-only policy. Switching back clears held input and requires explicit activation. This demonstrates the mode boundary without converting `sim_tele` to `tele` or writing preview positions to Cyberwave. Live rotation/joints are not currently projected; the real catalog URDF is rendered at the observed root position; measured articulation is a follow-up for this particular control example.

Close any browser input session before running the connected transport smoke:

```sh
pnpm smoke:local
```

It checks input → local broker echo → bounded reference movement, zero release, loss-of-input expiry, and unchanged observed twin position, then closes its owned input session. Run against a dedicated test twin without another simulator producing concurrent observations.

## Backend physics simulation lifecycle

The 3D page includes a separate simulation controller for today's `GET/POST /api/v1/environments/{uuid}/simulations` and `POST /api/v1/environments/{uuid}/simulations/{id}/stop`. Set `DEMO_ALLOW_SIMULATION_LAUNCH=true` on the BFF only for a dedicated local test environment. Start requests MuJoCo, CPU physics/controller settings, one environment, 30 seconds, and no automatic controller or media startup. The BFF rejects an existing active simulation and stops only the workload identity returned to this example. It does not accept arbitrary runtime fields from the browser.

Cyberwave's simulation start/stop also performs controller cleanup within that environment. Do not point this optional lifecycle example at a shared operational environment. Closing a viewer does not stop a backend workload; use Stop owned simulation or let its bounded lifetime complete. Request acceptance is distinct from worker assignment, readiness, completion, and stop confirmation. If the request outcome is unknown, inspect Cyberwave rather than automatically retrying. A BFF restart loses local ownership and requires inspecting the backend before managing the workload elsewhere.

An available local simulation worker, compatible asset/model artifacts, and a separately prepared policy runtime are needed for actual physics-driven robot motion. These examples do not install a worker, download an ONNX model, or claim that the kinematic reference consumer runs MuJoCo. Simulation lifecycle availability does not imply that controller preparation is supported. Check the target deployment and policy runtime before enabling input; this example does not prepare or authorize a live physical controller.

## Coordinate contract

Set `DEMO_LONGITUDE`, `DEMO_LATITUDE`, and `DEMO_ELLIPSOID_HEIGHT` to the WGS84 environment origin. Local units are meters, with +Z Up. `DEMO_YAW_DEGREES` is local +X heading counterclockwise from East. The adapter rotates XY into East/North/Up, then uses Cesium's ENU-to-Earth-fixed transform. Its inverse converts globe picks to environment coordinates; picked navigation points remain on local Z=0.

The default Rome anchor is fixture data, not a calibration. Cesium ellipsoid height is not robot navigation height or aircraft relative-to-takeoff altitude. This example supports local Cartesian navigation only. It does not change the backend localization/map anchor or skip environment-to-navigation conversion. Connected integrations must verify both transforms and reject stale map/localization revisions.

The navigation and aerial-draft globes (03/08) use Cesium's generated grid imagery: no ion token, external tiles, or network terrain is required. The asset-operations map (18) explicitly enables OpenStreetMap; the connected atlas (19) defaults to a local grid. Additional GIS layers belong in the renderer; their credentials/datums are separate from Cyberwave authorization. Configuration follows [Cesium's Vite guide](https://cesium.com/blog/2024/02/13/configuring-vite-or-webpack-for-cesiumjs/); coordinate conversion follows [Cesium Transforms](https://cesium.com/learn/cesiumjs/ref-doc/Transforms.html).

## Module responsibilities

| File | Responsibility |
| --- | --- |
| `src/domain.ts` | Immutable draft edits, structural validation, local-navigation compilation; no network or renderer. |
| `src/gis.ts` | Cesium projection, route overlay, selection/picking callbacks; no command imports. |
| `src/api.ts` | Data and command methods replaceable with generated SDK operations. |
| `src/main.ts` | Composition root connecting gestures to drafts and dedicated buttons to commands. |
| `src/simulation.ts` | Pure explicit-clock route sampling, keyboard intent compiler, TTL-aware reference consumer. |
| `src/keyboard-telecontrol.ts` | Reusable input UI controller and lifecycle, independent of 3D. |
| `src/robot-view.ts` | Real URDF/GLB projection of supplied simulation/observed poses; no command imports. |
| `src/robot-environment.ts` | Composition root for runtime modes, controller UI, observation, and physics lifecycle. |
| `src/example-shell.ts` / `.css` | Shared branded header, React connection form and per-example guidance; no renderer dependency. |
| `controller-gateway.mjs` | Server target/policy checks, input ownership/freshness, local MQTT publisher and reference consumer. |
| `simulation-gateway.mjs` | Explicit bounded backend physics workload start/status/owned stop. |
| `server.mjs` | Local BFF holding credentials and restricting environment/twins/endpoints; forwards commands only when explicitly enabled. |

The adapter posts navigation-only drafts to `POST /api/v1/twins/{uuid}/navigation`, reads `/actions/{action_id}`, and submits `/actions/{action_id}/cancel`. Local validation checks shape, not reachability, obstacles, authorization, or readiness. It does not implement the future prepared-plan/revision API, mixed-task mission persistence, automatic command retry, or end-to-end idempotency. Network failure after dispatch can leave the outcome unknown; inspect Cyberwave instead of automatically resubmitting.

Closing the view disposes Cesium and observation timers without cancelling autonomous backend commands. Live status polls REST rather than MQTT. Production apps should persist execution references and reconnect their observation layer after navigation; fixture preview is not a persistent orchestrator.

All settings are documented in `.env.example` and are local-only; no deployment workflow or Terraform settings are introduced.

Run `pnpm test` from the repository root for the client and gateway/controller checks. The production build uses multiple Vite HTML entries. Cesium is isolated to the navigation, aerial planning and GIS operations pages; the environment and robot views use the optional Three.js package. [Vite multi-page applications](https://vite.dev/guide/build.html#multi-page-app).


## Inspection and aerial workbenches

- `/aerial-inspection.html`: rectangular coverage draft, camera overlap, multirotor/fixed-wing/VTOL profiles, runway/catapult/recovery choices, survey-only time, energy reserve and turn-radius diagnostics. Cesium displays a synthetic local reference. The animation is a kinematic cursor; it does not fly the launch/recovery phases or model aerodynamics. An explicit ISO offset is required for a requested start. Exported JSON remains `draft-needs-validation`; there is no flight-upload button.
- `/inspection-workbench.html`: synthetic linear asset with two campaigns and three persistent defects. Demonstrates overlapping uncertainty, pixel-only measurement and missing coverage, independent severity/priority/technical state, reasoned review revisions and validated-only handoff export. A local video can be opened without upload. The local draft resets on reload. The optional development-backend panel imports two synthetic manifests and saves authenticated review revisions. Remote writes are disabled in this example. Delivery acceptance, video ingestion and maintenance exchange remain follow-up work.
- `/recording-review.html`: connect to the real API, select an environment and browse its paginated recording catalog. Load playback sources lazily, handle materializing/error/unsupported sources, refresh expired signed URLs and play finalized MP4 tracks. This does not fabricate clips when local storage lacks a playable recording.

Reusable public APIs live in `cyberwave` and `@cyberwave/react`. The experimental application logic in `src/aerial-domain.ts` and `src/inspection-domain.ts` stays in the examples while broader domain contracts mature. Extend the existing backend coverage planner and mission/workflow scheduling services in your integration instead of embedding a second scheduler or flight controller in the UI.

Technical references: [PX4 fixed-wing mission](https://docs.px4.io/main/en/flight_modes_fw/mission), [PX4 takeoff](https://docs.px4.io/main/en/flight_modes_fw/takeoff), [VTOL mission](https://docs.px4.io/main/en/flight_modes_vtol/mission), [MAVLink mission protocol](https://mavlink.io/en/services/mission.html). In particular, upload acknowledgment and current/reached mission-item telemetry are different from generic command acceptance. Pin the target firmware and vehicle capability profile in a production adapter.


## Workflow planning and schedules

[Workflows & schedules](http://127.0.0.1:5173/mission-library.html) is example 11. Choose an environment or workspace, select a template, create an inactive draft, configure its declared inputs and targets, and save. Run now or choose a recurring cron/timezone and enable the schedule. The Scheduled view shows the same workflow definitions; the execution monitor reads real backend runs and node results. Pause a workflow before editing; cancel an active run separately. Configuration writes and execution are available on authenticated loopback connections only. A failed multi-request save may leave an inactive partial draft, so reload before retrying. No automatic mutation retries or new mission model are introduced.

The form reuses `metadata.editable_fields` and existing literal input mappings. Dynamic bindings and multi-entry/event workflows remain in the platform editor. Schedules repeat; one-off execution requests and arbitrary dynamic allocation remain future backend increments. The updated branch backend supports bounded workflow/history pagination. Local examples request pages from the server; remote compatibility mode retains client pagination. See the [workflow SDK guide](../../README.md#planning-with-workflows) for methods and constraints.

### Connection and edit consistency

The development gateway holds credentials in memory, addressed by an HttpOnly session cookie. Each restored connection also has a non-secret revision ID. If another tab reconnects, an existing client fails with a connection-change error instead of silently using the replacement origin/account; reconnect or reload that example. This is example-gateway behavior, not a new platform authentication scheme.

Workflow form validation finishes before the first write. Only changed static inputs are patched, preserving dynamic bindings and unchanged schedule nodes. Timing changes are explicit and keep the existing backend conflict guard. Multi-node saves still use separate API operations: reload an inactive draft after a partial failure before retrying. The workflow catalog is locked while its operation is pending.

Controller examples retain their own lease ID in tab-scoped session storage so an interrupted reload can recover on the next explicit activation. The ID does not authorize closing another tab’s session. Motion still expires independently at the reference consumer.


## Maintenance scenarios

Read the [maintenance integration guide](MAINTENANCE.md). Example 12 reads real branch inspection campaigns and selects only observed findings whose latest review is validated. It retains exact source/review references, supports preventive work without a defect, and reuses `WorkflowCatalog` for template selection, configuration, scheduling and monitoring. Proposals and sample crew reservations are local; exporting is not submission or dispatch.

Example 13 demonstrates a synthetic external work-order inbox: duplicate updates are harmless, stale/conflicting updates require reconciliation, and later source revisions may reopen work. Verification and delivery acceptance are separate. A reviewed finding can resolve while incomplete campaign coverage still requires rework; a complete report can accurately record a persistent defect. It uses the same workflow planner for a verification visit, without inferring business acceptance from run success.


### Backend-owned contracts and verification

The workflow catalog/planner/monitor now come from `@cyberwave/react`, including their styles and typed backend input definitions. `cyberwave` owns reusable input parsing/patch helpers and the generated preview contracts. Example code only chooses scope and its local-write policy.

Example 13 also contains **Verify evidence stored in Cyberwave**. Choose an environment, a campaign and a validated finding; select later stored evidence of covered-target absence and save a reasoned resolution. The branch API records the authenticated reviewer, baseline review, optional external order reference and revision. Reload evidence to verify persistence. In the explicitly named **SDK inspection sandbox**, a button imports a clearly labelled synthetic verification visit for local testing. The synthetic inbox at the top remains browser-only and never closes an external order or accepts a campaign.


For application-owned server integrations, see the [typed governance and evidence recipes](../recipes/README.md). They reuse existing workspace metrics, organization credits, Episodes and Datasets. They do not add routes to this example gateway or claim arbitrary image-label training support.

### Human actions and dataset evidence (preview backend)

Open [Human actions & evidence](http://127.0.0.1:5173/human-evidence.html) from the header dropdown. Connect to the matching local backend as the assigned person. The example lists actions, submits explicit consent/acknowledgement, and lets you choose a media collection by name. The platform inbox handles photo upload; Dataset → Samples handles labels. The shared `DatasetBrowser` selects a named collection; `DatasetSampleBrowser` follows backend cursors, filters approved samples and opens selected evidence with its review revision. A collection link continues into example 15 without credentials or media URLs. See [human-action recipes](../recipes/human-actions.ts), [evidence recipes](../recipes/evidence.ts), and [reviewed YOLO training export](../training/README.md). Remote reads remain available; this demonstration gateway limits mutations to authenticated local APIs.

### Capture and annotation

[15 · Capture & annotation](http://127.0.0.1:5173/image-annotation.html) opens local photos or a selected sample from a paginated Dataset, captures camera frames, edits boxes/polygons and saves an explicit sample review. The shared header controls the target API. Choose a model by name to load supported image tasks and their input guidance from the backend, then explicitly run one; remote writes remain disabled in this demo. Masks remain model proposals until reviewed, with no fabricated mask-to-box conversion. See the [React annotation guide](../../packages/react/ANNOTATION.md) and [training export](../training/README.md).

The workbench locks sample navigation and source changes while labels have unsaved edits. Save the review, or export and explicitly discard edits to continue. Successful saves reload the browser page and retain the backend revision; conflicting saves require discarding/reloading the current sample.

For a queued model, the panel shows the accepted execution ID and status. **Stop monitoring** stops browser reads while the backend job continues; **Resume monitoring** reads the same execution without another inference submission. The resume handle belongs to the current API connection, image and task; changing these or reloading clears it. Monitoring times out after five minutes, leaving the accepted ID available to resume. Only canonical, task-compatible completed results reach the overlay. HTTP errors and failed jobs remain visible.

## Dedicated sensor examples

Examples 16 and 17 share environment/twin/sensor selection, the API header and SDK hooks. Sensors come from backend-resolved capabilities. The video example requires an active RGB/depth producer, the new backend video routes, and a reachable SFU; it consumes live or simulation video without starting a producer or issuing control commands. Configure deployment ICE servers in its advanced control if needed. Its POST negotiation is allowed only against authenticated local APIs in this development BFF. Stop viewing before changing API connections. The telemetry example offers paginated persisted history and a separate live panel through the local MQTT bridge described below. Live delivery does not imply persistence, and neither panel substitutes synthetic data for missing packets.

See the [custom UI guide](../../docs/custom-ui.md) for auth, source identity, lifecycle, error states, clocks, styling, recording capture and remaining deployment capabilities.

### Live sensor bridge

Example 16 now uses the reusable `SensorVideoPanel`; example 17 includes
`LiveSensorTelemetryPanel` alongside REST history. For local MQTT reads configure
`DEMO_MQTT_URL=mqtt://127.0.0.1:1883`, `DEMO_MQTT_USERNAME`,
`DEMO_MQTT_PASSWORD`, and `DEMO_MQTT_ENVIRONMENT_PREFIX=local` on the server.
The header must select the configured local API and an authenticated session.
The bridge checks read access and the exact sensor ID, allows only the displayed
telemetry channels, releases disconnected subscriptions and expires streams after
five minutes. Resume explicitly after an interrupted or expired subscription.

Simulation video uses the exact returned stream instance ID. The camera console
is receive-only: selecting Simulation does not launch a workload. Capture and
PNG download operate on decoded browser frames. See the
[composition guide](../../docs/custom-ui.md#compose-a-camera-console-and-a-live-sensor-panel)
for custom capture/annotation flows and application-owned MQTT adapters.

## GIS journeys and activity results

Example 18 is fully synthetic and can be explored without private API access. Search a site or industry, select a Cesium marker, choose an inspection/intervention, filter results and export JSON. OpenStreetMap is enabled explicitly and can be replaced with the local grid. Example 19 reads actual environment/campaign/recording catalogs from the shared connection; absent geo anchors and media remain explicit. No map click starts work. See [GIS components and integration](../../docs/gis-operations.md) for composition, coordinate contracts, authorized media resolution and source-of-truth boundaries. The maintenance campaign picker and recording-review page now reuse these same components.


## Build your own experience

Start with the [React component reference](../../packages/react/README.md) and [checked camera → capture → review composition](src/recipes/camera-review.tsx). The [component roadmap](../../docs/component-opportunities.md) records remaining integration gaps and proposed reusable pieces. Example catalog edits are checked during `pnpm build`; regenerate this page's catalog with `pnpm examples:write`.

The dataset and model catalogs page on the backend. Name/UUID filtering applies to the current page; use Next to explore more. Direct UUID entry remains available under an advanced disclosure. Model modalities and custom ports come from the backend, and this annotation example enables only the advertised structured image tasks.
