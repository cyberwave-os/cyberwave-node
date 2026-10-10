# Cyberwave JavaScript SDK

## Planning with workflows

The preferred public model is **workflow template → configured workflow → run**, with optional scheduling. A mission can be a domain label for an operational run; new applications should not need separate Task, Mission and Workflow records to represent the same activity. Templates already use Workflow records, and subworkflows reuse the existing Run Workflow node.

A custom UI can select a template, configure inputs/targets, run now or schedule, then monitor the execution. The current SDK exposes read helpers and the generated REST contract; unified one-off scheduling, correlated child completion and dynamic resource allocation still need backend lifecycle work. Existing interval/cron workflow triggers are the starting point. Dynamic selection should resolve eligible resources in a workflow step and record the choice on the run; some edge actions still require targets fixed before compilation.

Legacy task-sequence Mission APIs remain compatibility surfaces. The example browses both stores while migration semantics are assessed. No new Plan/Activity entity or second orchestration engine is introduced.

## Missions, simply

| Primitive | Meaning |
| --- | --- |
| Environment | Where activity happens: a scene, site or operating area. |
| Twin | What participates: a robot, machine or represented object. |
| Task | A reusable capability, such as navigation, motion or model inference. |
| Mission / plan | The intended activity. Currently represented by a task-sequence Mission or an environment-bound Workflow. |
| Execution | One attempt to run a definition, now or at a requested time. |
| Workflow | Reusable orchestration with its own executions. Run Workflow nodes can invoke other workflows. |

For task-sequence missions, a planned run is stored in the backend's `MissionExecution`, including `start_at`; the reusable definition is stored in `Mission`. Missions and workflows do not require a one-to-one match. Inspection campaigns group evidence and reviews and can exist without robot missions. The same mission primitives can serve logistics, inspection, manufacturing or command/control. A manipulation/composite task label alone does not imply an implemented controller capability.

See [Workflows, missions & runs](http://127.0.0.1:5173/mission-library.html) for a readable walkthrough and real mission browsing. The development backend adds these read views over the existing mission store:

```ts
await client.environments.missions(environmentId, { limit: 20, offset: 0 });
await client.missions.forWorkspace(workspaceId, {
  environment_uuid: environmentId, // optional filter
  // twin_uuid: twinId,
  limit: 20, offset: 0,
});
await client.missions.executions(twinId, missionId);
// Existing workflow plans are a separate read projection in the same example.
await client.workflows.list({ workspace_uuid: workspaceId, environment_uuid: environmentId });
await client.workflows.executions(workflowId);
```

The new routes are `GET /api/v1/environments/{uuid}/missions` and `GET /api/v1/workspaces/{workspace_uuid}/missions`. Access follows the target twin, with workspace membership/token scope enforced. Definition responses include current environment/workspace context. Discovery does not dispatch an execution.

Task-sequence Mission records target one twin and inherit its current environment. Workflow records belong to a workspace with an optional environment binding. The mission example shows both stores; they are not automatically paired. A workflow-backed mission can invoke another workflow through the existing Run Workflow node. A task-sequence Mission does not yet have a workflow step.

The recommended evolution is one planning interface over the existing workflow engine plus an adapter for task-sequence missions. Keep reusable definitions separate from run requests and execution results. Add correlated child completion, cancellation and durable scheduling before exposing arbitrary composition. Trigger acceptance is not completion. For multiple environments, use explicit step targets within one workspace and immutable execution context; do not duplicate a plan per environment.

Scalability limits are explicit: the new Mission views paginate on the server; the old per-twin fallback and existing workflow listing are not suitable for large aggregate catalogs. Workflow display pages in the example do not bound API response size. A bounded server-side planning catalog is the next increment. A unified planning execution API is a proposal, not an exported SDK feature.

## Development inspection extension

The branch backend persists four records: **campaign → observation → review revisions**, with each observation linked to a persistent **defect** across campaigns. Environment permissions govern reads/writes. Campaign import is atomic and idempotent by environment/external ID; changed manifests conflict. Source observations are immutable through this API. Review writes require a reason, the current revision and an idempotency key, and record the authenticated reviewer. Missing coverage cannot establish a resolved defect.

Use `client.inspections.list/get/importCampaign/history/review`. Manifests contain evidence identifiers, measurements/uncertainty, localization and model provenance; importing does not fetch URLs or upload videos. Delivery acceptance, resumable video ingestion, complete AI-run parameters, defect merges, maintenance synchronization, verified resolution, signed reports and retention policy remain later increments.

These additive endpoints are **development features**, not a claim about production deployment. Their OpenAPI fragment is exported from the backend into `schema/extensions.openapi.json` and generated into `src/generated/extensions.ts`, separate from the pinned production schema. Refresh with `pnpm generate --extensions-from=/absolute/path/to/backend-openapi.json`. Older servers can return 404; the mission example falls back to per-twin reads, and the inspection panel explains unavailability. The example gateway permits only explicit inspection metadata POSTs on authenticated localhost connections; device command routes remain separate.

The official [`cyberwave`](https://www.npmjs.com/package/cyberwave) package for Node.js and browser applications, with optional React components and a 3D renderer. This is the next increment of [cyberwave-node](https://github.com/cyberwave-os/cyberwave-node), retaining its package identity and Apache-2.0 license.

**Release status:** this branch prepares `0.1.0`. The published `0.0.1` package is the earlier placeholder; installing it from npm does not install this implementation. Build from this checkout or install the locally packed tarballs until a release is approved.

## Packages

| Package | Responsibility |
| --- | --- |
| `cyberwave` | Generated OpenAPI types + typed Fetch transport; authentication injection, catalog/environment, mission and recording read helpers and scene loading. No React or 3D dependency. |
| `@cyberwave/react` | `CyberwaveProvider`, `useCyberwave`, `useEnvironment`, `ConnectionPanel`, `EnvironmentBrowser`, `AssetBrowser`, `EnvironmentSummary`, `RecordingBrowser`, `useRecordingPlayback`, `RecordingVideo`; opt-in CSS tokens. |
| `@cyberwave/environment-3d` | Read-only Three.js renderer for actual GLB and URDF models, meshes, measured poses and joints; orbit, fit and selection. No command transport. |

## Run the examples

Use Node 24+ and pnpm 10.28.0. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm server
# In a second terminal:
pnpm dev
```

Open the [asset studio](http://127.0.0.1:5173/asset-catalog.html) or [environment explorer](http://127.0.0.1:5173/environments.html). The grouped header links all **eleven examples**, including [Cesium GIS planning](http://127.0.0.1:5173/), [mission simulation](http://127.0.0.1:5173/mission-simulation.html), [robot runtime modes](http://127.0.0.1:5173/robot-environment.html), [keyboard input](http://127.0.0.1:5173/keyboard-telecontrol.html), and [camera monitoring](http://127.0.0.1:5173/twin-monitor.html).

New workbenches: [aerial inspection planning](http://127.0.0.1:5173/aerial-inspection.html), [campaign and evidence review](http://127.0.0.1:5173/inspection-workbench.html), and [recording catalog/playback](http://127.0.0.1:5173/recording-review.html).

See the [example guide](examples/developer-console/README.md) for local backend, broker, and physics-worker configuration. The examples run from this repository without the private Cyberwave application.

The explorer defaults to **https://api.cyberwave.com**. Public catalog assets work anonymously. Enter a token to access authorized environments, or enter a custom HTTPS/localhost API origin. The development gateway handles API CORS, holds the token in memory for one hour and uses an HttpOnly SameSite session cookie. Reconnecting invalidates the previous session; disconnect removes it. Tokens are never written to browser storage or sent to model storage URLs. A production application should provide its own authenticated BFF and session lifecycle.

## Use the client

```ts
import { createCyberwave } from 'cyberwave';

const client = createCyberwave({
  // Defaults to https://api.cyberwave.com; immutable for this client instance.
  baseUrl: process.env.CYBERWAVE_API_URL,
  getToken: () => process.env.CYBERWAVE_API_TOKEN,
});
const environments = await client.environments.list({ limit: 20 });
const scene = await client.loadEnvironment(environments[0].uuid);
console.log(scene.objects, scene.warnings);

// Full generated API escape hatch: request/response types follow OpenAPI.
const result = await client.rest.GET('/api/v1/environments/{uuid}/waypoints', {
  params: { path: { uuid: environments[0].uuid } },
});
if (!result.response.ok) throw new Error(`Request failed: ${result.response.status}`);
```

The application owns authentication: provide a per-request `getToken` callback for refreshed tokens, and create a new client when the origin or user changes. REST helpers throw `CyberwaveError` with HTTP status; the generated `rest` interface returns `{ data, error, response }`. Read helpers accept `AbortSignal`. API requests have a timeout, omit ambient cookies and reject redirects. SDK instances do not share credentials or caches.

Direct browser connections require the API to allow the application's origin. The examples use an injectable same-origin Fetch adapter instead. Long-lived privileged API keys belong in a server/BFF, not in a frontend bundle. The development token form is for explicit integration testing, not an OAuth login implementation.

## Compose React UI

```tsx
import { CyberwaveProvider, EnvironmentBrowser } from '@cyberwave/react';
import '@cyberwave/react/styles.css';

<CyberwaveProvider client={client}>
  <EnvironmentBrowser onSelect={environment => setEnvironmentId(environment.uuid)} />
</CyberwaveProvider>
```

`useEnvironment(id)` loads metadata, twins and deduplicated asset references with cancellation. `EnvironmentSummary` displays counts and partial-loading notes. Override `--cw-*` CSS variables or use the headless client/hooks with your own components. For proxied resources, pass `resolveResource` to the browser components and renderer.

## Keep rendering separate from control

```ts
import { createEnvironmentViewer } from '@cyberwave/environment-3d';

const viewer = createEnvironmentViewer(container, { onSelect: setSelectedTwin });
const scene = await client.loadEnvironment(environmentId);
await viewer.setObjects(scene.objects);
viewer.updatePose(twinId, observedPose); // or a separate simulation snapshot
// On unmount:
viewer.destroy();
```

Scene coordinates are local Z-up metres; poses retain the API's quaternion, scale and root frame. The viewer never publishes commands. Mission drafts, user input, control ownership, validation and execution belong to separate adapters. The Cesium example demonstrates a separate GIS renderer with an explicit local-to-ENU anchor. The keyboard example compiles input to the existing `locomotion.velocity_command.v1` contract. Kinematic preview, observed telemetry and backend physics have distinct lifecycles.

Currently supported visuals: GLB and URDF with DAE/STL/OBJ/GLTF meshes. Unsupported representations (such as splats) and unresolved attached frames are reported, rather than positioned incorrectly. External GLTF resources/URDF package layouts may need a custom resolver; OBJ material libraries, Draco/KTX decoders, live MQTT observation and WebRTC extraction remain follow-up work. Large Cesium/Three bundles are loaded only by examples that use them, never by the core SDK.

## Generated contracts and validation

```sh
pnpm generate            # deterministic: use checked-in schema
pnpm generate --refresh  # intentionally refresh from production (or CYBERWAVE_API_URL)
pnpm build
pnpm test
pnpm pack:check          # install all tarballs outside the workspace; verify imports/types
```

The pinned [OpenAPI TypeScript generator](https://openapi-ts.dev/) generates `src/generated/schema.ts` from the public API snapshot in `schema/openapi.json`. `schema/sha256.txt` records its digest. Never hand-edit generated types. Keep ergonomic client/UI code separate so regeneration cannot overwrite it. CI checks regeneration, builds, tests, and standalone packaging. Networked API/model checks are explicit development validation, not a CI dependency.

The package remains ESM, uses the platform Fetch API, and publishes compiled JavaScript plus declarations. No npm publish is performed by CI in this increment. The initial follow-up should establish trusted npm publishing and versioning for the three packages together.


## Recording review and mission reads

```ts
const page = await client.recordings.list(environmentId, { limit: 12 });
// Keep page.next_cursor for pagination; do not assume one page is the whole history.
const playback = await client.recordings.playback(environmentId, recordingId);
if (playback.status === 'materializing') {
  // Show readiness and offer retry after playback.retryAfterSeconds.
} else {
  const tracks = recordingVideos(playback.sources); // import from 'cyberwave'
  // Finalized MP4 tracks only; signed URLs are short-lived credentials.
}
const missions = await client.missions.list(twinId);
const executions = await client.missions.executions(twinId, missionId);
```

`RecordingBrowser` and `useRecordingPlayback` share provider auth and cancellation. `RecordingVideo` wraps native playback and emits media-relative seconds. Catalog timestamps are microseconds, including the legacy aliases. `recordingWindow` validates them without guessing units; precise sensor alignment needs a capture-clock/SEI adapter. Refresh playback descriptors when signed URLs expire. Never persist signed URLs in campaign exports. Actuation Parquet, point clouds and chunked recordings need dedicated adapters and are explicitly reported as unsupported by the basic video example.

Mission writes remain available through `client.rest` using generated contracts. The examples' general connection permits reads only. A saved task sequence, a scheduled execution, and a validated aircraft flight plan are separate concepts. Application services own preparation, approvals, idempotency, resource allocation and command execution.

The aerial workbench is a synthetic draft and kinematic cursor, not an autopilot or physics simulator. It distinguishes multirotor, runway/catapult fixed-wing and hybrid VTOL requirements. Coverage geometry assumes flat ground; non-AGL input is blocked pending terrain/datum conversion. It exposes runway length, turn-radius and reserve checks without declaring a route flight-ready. The inspection workbench keeps persistent defect identity separate from campaign observations, technical condition, review and maintenance priority; its local review/export data model is illustrative and is not an implemented backend API.
