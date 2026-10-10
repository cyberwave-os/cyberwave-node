# Cyberwave developer console

Seven examples share the official `cyberwave` client, optional React/3D packages and a Cyberwave-style header. Start them from the [SDK repository root](../../README.md), after `pnpm build`, with `pnpm server` and `pnpm dev`.

| Type | Example | Integration |
| --- | --- | --- |
| SDK components | [01 · Environment explorer](http://127.0.0.1:5173/environments.html) | Custom API origin, authentication, environment browser, metadata/twin/asset loading, real GLB/URDF scene. |
| SDK components | [02 · Asset studio](http://127.0.0.1:5173/asset-catalog.html) | Production catalog, search/pagination, real model preview and isolated kinematic motion. |
| Visualization | [03 · Cesium GIS](http://127.0.0.1:5173/) | Local/ENU mapping, waypoints, immutable mission drafts and explicit dispatch. |
| Visualization | [04 · Twin & camera monitor](http://127.0.0.1:5173/twin-monitor.html) | Observation and authenticated latest-frame snapshots. |
| Simulation | [05 · Mission timeline](http://127.0.0.1:5173/mission-simulation.html) | Deterministic play/pause/seek/reset without changing observed data. |
| Simulation | [06 · Robot runtime modes](http://127.0.0.1:5173/robot-environment.html) | Actual Go2 model, controller preview / local observation switching, optional MuJoCo lifecycle. |
| Command & control | [07 · Keyboard input](http://127.0.0.1:5173/keyboard-telecontrol.html) | Space + WASD/QE to bounded velocity intent, with session ownership and expiry. |

## Production, local and custom connections

The explorer and asset studio default to `https://api.cyberwave.com`. Connect anonymously for public assets; enter a Cyberwave API token for private environments. Use `http://localhost:8000` or any custom HTTPS API origin for integration testing. Changing origins clears the scene and requires a new credential choice. Tokens stay in the local gateway's memory; model requests never forward them. `Disconnect` revokes the session.

If a server-side `CYBERWAVE_API_TOKEN` is configured for the local gateway's exact origin, the explorer can use it when you explicitly connect to that local origin. It is never used for production or another custom origin. The source of the current connection is shown above the scene.

The connection panel configures **browsing, local inspection metadata writes and workflow configuration/execution**. Remote origins remain read-only in this example gateway. Control examples retain their separately configured local environment, target and policy. Selecting production in the explorer never retargets command delivery. A static frontend alone is insufficient: `/gateway` and `/api` need the example BFF. This loopback-only server is a development tool, not a publicly deployable multi-user proxy.

Choose **Unitree Go2** to reproduce production URDF/DAE model loading. No model files or private environment data are bundled. Models are fetched from the selected API's returned resource URLs. Use real local assets/environments to validate project-specific file formats and frame conventions; unsupported visuals are reported in loading notes.

## Connect the command examples to local Cyberwave

Copy `.env.example` to `.env`, select `DEMO_MODE=connected`, and set a loopback API URL (normally `http://localhost:8000`), server-held API token, and environment UUID. The privileged command gateway rejects remote Cyberwave API origins. The separate explorer connection accepts production and custom HTTPS origins. The optional twin allowlist further narrows access. In the Cyberwave monorepo, use `make backend` to start a local backend when needed. Restart `pnpm run server` after configuration changes.

The token stays on the server and never enters `VITE_*` variables or browser responses. The BFF binds only to loopback and accepts the example's local browser origin. It has no partner login or production session management; a public deployment needs the authentication and authorization work described in the root SDK README.

The app reads twins and saved waypoints, polls REST snapshots/action status, and displays an authenticated latest-camera-frame image. Relative waypoint frames are omitted pending explicit server resolution. Camera snapshots are not WebRTC streaming; the future media adapter can supply a MediaStream through the same presentation boundary.

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

The server compiles allowed key codes into the existing packet used by [the simulation controller scenario](../../cyberwave-cloud-nodes/tests/sim-scenarios/drive_during_mapping.py): `source_type: sim_tele`, `command: locomotion_velocity`, and `data.contract: locomotion.velocity_command.v1`. It publishes to `localcyberwave/twin/{uuid}/command` with 300 ms duration, QoS 0, retain false, no reconnect/replay queue. It subscribes to its exact topic, consumes only its own session-tagged packets, and drives a separate reference pose from actual broker echoes. Delivery/echo is not acknowledgment of physical execution.

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

An available local simulation worker, compatible asset/model artifacts, and a separately prepared policy runtime are needed for actual physics-driven robot motion. These examples do not install a worker, download an ONNX model, or claim that the kinematic reference consumer runs MuJoCo. The current local deployment exposes simulation lifecycle endpoints but predates `control-profile/inputs/prepare`; full live input preparation is a follow-up capability, described in the root SDK README.

## Coordinate contract

Set `DEMO_LONGITUDE`, `DEMO_LATITUDE`, and `DEMO_ELLIPSOID_HEIGHT` to the WGS84 environment origin. Local units are meters, with +Z Up. `DEMO_YAW_DEGREES` is local +X heading counterclockwise from East. The adapter rotates XY into East/North/Up, then uses Cesium's ENU-to-Earth-fixed transform. Its inverse converts globe picks to environment coordinates; picked navigation points remain on local Z=0.

The default Rome anchor is fixture data, not a calibration. Cesium ellipsoid height is not robot navigation height or aircraft relative-to-takeoff altitude. This example supports local Cartesian navigation only. It does not change the backend localization/map anchor or skip environment-to-navigation conversion. Connected integrations must verify both transforms and reject stale map/localization revisions.

The globe uses Cesium's generated grid imagery: no ion token, external tiles, or network terrain is required. Additional GIS layers belong in the renderer; their credentials/datums are separate from Cyberwave authorization. Configuration follows [Cesium's Vite guide](https://cesium.com/blog/2024/02/13/configuring-vite-or-webpack-for-cesiumjs/); coordinate conversion follows [Cesium Transforms](https://cesium.com/learn/cesiumjs/ref-doc/Transforms.html).

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
| `src/example-shell.ts` / `.css` | Shared branded header and grouped navigation; no framework or renderer dependency. |
| `controller-gateway.mjs` | Server target/policy checks, input ownership/freshness, local MQTT publisher and reference consumer. |
| `simulation-gateway.mjs` | Explicit bounded backend physics workload start/status/owned stop. |
| `server.mjs` | Local BFF holding credentials and restricting environment/twins/endpoints; forwards commands only when explicitly enabled. |

The adapter posts navigation-only drafts to `POST /api/v1/twins/{uuid}/navigation`, reads `/actions/{action_id}`, and submits `/actions/{action_id}/cancel`. Local validation checks shape, not reachability, obstacles, authorization, or readiness. It does not implement the future prepared-plan/revision API, mixed-task mission persistence, automatic command retry, or end-to-end idempotency. Network failure after dispatch can leave the outcome unknown; inspect Cyberwave instead of automatically resubmitting.

Closing the view disposes Cesium and observation timers without cancelling autonomous backend commands. Live status polls REST rather than MQTT. Production apps should persist execution references and reconnect their observation layer after navigation; fixture preview is not a persistent orchestrator.

All settings are documented in `.env.example` and are local-only; no deployment workflow or Terraform settings are introduced.

Run `pnpm test` from the repository root for the client and gateway/controller checks. The production build uses multiple Vite HTML entries. Cesium is isolated to the GIS and aerial planning pages; the environment and robot views use the optional Three.js package. [Vite multi-page applications](https://vite.dev/guide/build.html#multi-page-app).


## Inspection and aerial workbenches

- `/aerial-inspection.html`: rectangular coverage draft, camera overlap, multirotor/fixed-wing/VTOL profiles, runway/catapult/recovery choices, survey-only time, energy reserve and turn-radius diagnostics. Cesium displays a synthetic local reference. The animation is a kinematic cursor; it does not fly the launch/recovery phases or model aerodynamics. An explicit ISO offset is required for a requested start. Exported JSON remains `draft-needs-validation`; there is no flight-upload button.
- `/inspection-workbench.html`: synthetic linear asset with two campaigns and three persistent defects. Demonstrates overlapping uncertainty, pixel-only measurement and missing coverage, independent severity/priority/technical state, reasoned review revisions and validated-only handoff export. A local video can be opened without upload. The local draft resets on reload. The optional development-backend panel imports two synthetic manifests and saves authenticated review revisions. Remote writes are disabled in this example. Delivery acceptance, video ingestion and maintenance exchange remain follow-up work.
- `/recording-review.html`: connect to the real API, select an environment and browse its paginated recording catalog. Load playback sources lazily, handle materializing/error/unsupported sources, refresh expired signed URLs and play finalized MP4 tracks. This does not fabricate clips when local storage lacks a playable recording.

Reusable public APIs live in `cyberwave` and `@cyberwave/react`. The experimental application logic in `src/aerial-domain.ts` and `src/inspection-domain.ts` stays in the examples while broader domain contracts mature. Extend the existing backend coverage planner and mission/workflow scheduling services in your integration instead of embedding a second scheduler or flight controller in the UI.

Technical references: [PX4 fixed-wing mission](https://docs.px4.io/main/en/flight_modes_fw/mission), [PX4 takeoff](https://docs.px4.io/main/en/flight_modes_fw/takeoff), [VTOL mission](https://docs.px4.io/main/en/flight_modes_vtol/mission), [MAVLink mission protocol](https://mavlink.io/en/services/mission.html). In particular, upload acknowledgment and current/reached mission-item telemetry are different from generic command acceptance. Pin the target firmware and vehicle capability profile in a production adapter.


## Workflow planning and schedules

[Workflows & schedules](http://127.0.0.1:5173/mission-library.html) is example 11. Choose an environment or workspace, select a template, create an inactive draft, configure its declared inputs and targets, and save. Run now or choose a recurring cron/timezone and enable the schedule. The Scheduled view shows the same workflow definitions; the execution monitor reads real backend runs and node results. Pause a workflow before editing; cancel an active run separately. Configuration writes and execution are available on authenticated loopback connections only. A failed multi-request save may leave an inactive partial draft, so reload before retrying. No automatic mutation retries or new mission model are introduced.

The form reuses `metadata.editable_fields` and existing literal input mappings. Dynamic bindings and multi-entry/event workflows remain in the platform editor. Schedules repeat; one-off execution requests and arbitrary dynamic allocation remain future backend increments. The existing scoped workflow list is unpaginated, so the UI's 20-row pages do not bound server response size. See the [workflow SDK guide](../../README.md#planning-with-workflows) for methods and constraints.

### Connection and edit consistency

The development gateway holds credentials in an HttpOnly session cookie. Each restored connection also has a non-secret revision ID. If another tab reconnects, an existing client fails with a connection-change error instead of silently using the replacement origin/account; reconnect or reload that example. This is example-gateway behavior, not a new platform authentication scheme.

Workflow form validation finishes before the first write. Only changed static inputs are patched, preserving dynamic bindings and unchanged schedule nodes. Timing changes are explicit and keep the existing backend conflict guard. Multi-node saves still use separate API operations: reload an inactive draft after a partial failure before retrying. The workflow catalog is locked while its operation is pending.

Controller examples retain their own lease ID in tab-scoped session storage so an interrupted reload can recover on the next explicit activation. The ID does not authorize closing another tab’s session. Motion still expires independently at the reference consumer.
