# Cyberwave JavaScript SDK

## Planning with workflows

Use **workflow template → configured workflow → run**, with an optional recurring schedule. The [Workflows & schedules example](http://127.0.0.1:5173/mission-library.html) lets you select a template, create an inactive draft in an environment or workspace, configure targets, run now or enable a recurring schedule, and monitor node execution/results. It uses existing backend endpoints; no new mission model or scheduler is required.

```ts
const templates = await client.workflows.templates();
const draft = await client.workflows.clone(templates[0].uuid, {
  name: 'Daily site review', environment_uuid: environmentId,
});
const workflow = await client.workflows.get(draft.uuid);
const fields = workflowEditableFields(workflow); // import from 'cyberwave'
// Bind declared fields with workflows.updateNode and workflowNodePatch.
// Node edits carry expected_updated_at; conflicts require reloading.
await client.workflows.activate(workflow.uuid); // validates the full graph
const run = await client.workflows.execute(workflow.uuid, { node_uuid: manualTriggerId });
await client.workflows.execution(workflow.uuid, run.uuid);
await client.workflows.cancel(run.uuid);
```

Templates already declare `metadata.editable_fields`. These describe saved configuration defaults, **not** a universal runtime input schema. `workflowEditableFields` exposes existing node parameters and literal input mappings, respecting mapping precedence. Reference/expression/caller bindings stay intact. `workflowNodePatch` preserves unrelated configuration and includes the backend edit revision. Missing/optional fields without a declared stored value still require the workflow editor; dynamic per-run inputs must match the actual graph.

To schedule a supported single-entry static workflow, the example changes its existing Manual trigger to Schedule while inactive, keeping its connections. Save a validated cron expression and IANA timezone, then activate. `workflowSchedules` reads the same trigger configuration for the Scheduled view. `workflows.list({environment_uuid, trigger_type: 'schedule'})` also works with `workspace_uuid`; the API includes paused workflows with enabled schedule nodes. Fully disabled schedule nodes do not match that filter. `deactivate` pauses future runs; cancelling an in-flight execution is separate.

Writes in the example require an authenticated **local** API connection. Production/custom remote connections remain read-only in this development gateway. The SDK itself can call any configured API under its own authorization rules. Mutations are never automatically retried. A failed multi-request configuration can leave an inactive partial draft: reload it before retrying. The example does not guarantee transactional graph edits or execution idempotency.

The monitor polls history and the selected run every five seconds, suspends requests in hidden tabs, aborts on scope changes and stops on errors. It displays backend status rather than inventing completion. Scheduled workflows show cron/timezone, target defaults, runtime and enabled/paused state. Cron is recurring, not a one-off reservation or guaranteed start time; existing catch-up, concurrency and runtime availability rules apply.

### Boundaries and next increments

- A workflow belongs to a workspace and may bind one environment. Multi-environment activity needs explicit step targets and supported adapters.
- Updated workflow lists and execution history support server pagination. Pass limits explicitly; omitted workflow-list limits preserve legacy full-list behavior. The UI supports a compatibility mode for older deployments.
- Durable one-off scheduling, atomic due-slot claims/recovery, correlated child completion/cancellation and exclusive resource allocation remain backend work. They should extend workflows rather than introduce a parallel planning engine.
- “Dynamic workflow” can describe runtime composition in a product, but does not imply arbitrary dynamic target support: some edge actions require targets fixed before compilation.

### Legacy mission compatibility

Existing task-sequence Mission APIs remain accessible through `client.missions` and `client.environments.missions`; their paginated environment/workspace discovery requires the development extension. They are not automatically paired with workflows. New planning in example 11 uses workflows only. Preserve existing consumers and history until migration semantics are verified. Inspection campaigns and recordings remain separate evidence resources.

## Development inspection extension

The branch backend persists four records: **campaign → observation → review revisions**, with each observation linked to a persistent **defect** across campaigns. Environment permissions govern reads/writes. Campaign import is atomic and idempotent by environment/external ID; changed manifests conflict. Source observations are immutable through this API. Review writes require a reason, the current revision and an idempotency key, and record the authenticated reviewer. Missing coverage cannot establish a resolved defect. The updated API supports verified resolution with covered-target absence evidence and an explicit validated baseline review; see the persisted-verification section below.

Use `client.inspections.list/get/importCampaign/history/review`. Manifests contain evidence identifiers, measurements/uncertainty, localization and model provenance; importing does not fetch URLs or upload videos. Delivery acceptance, resumable video ingestion, complete AI-run parameters, defect merges, maintenance synchronization, signed reports and retention policy remain later increments.

These additive endpoints are **development features**, not a claim about production deployment. Their OpenAPI fragment is exported from the backend into `schema/extensions.openapi.json` and generated into `src/generated/extensions.ts`, separate from the pinned production schema. Refresh with `pnpm generate --extensions-from=/absolute/path/to/backend-openapi.json`. Older servers can return 404; the inspection panel explains unavailability. The example gateway permits allowlisted inspection metadata and workflow operations on authenticated localhost connections; telecontrol routes retain their separate configured target.

The official [`cyberwave`](https://www.npmjs.com/package/cyberwave) package for Node.js and browser applications, with optional React components and a 3D renderer. This is the next increment of [cyberwave-node](https://github.com/cyberwave-os/cyberwave-node), retaining its package identity and Apache-2.0 license.

**Release status:** this branch prepares `0.1.0`. The published `0.0.1` package is the earlier placeholder; installing it from npm does not install this implementation. Build from this checkout or install the locally packed tarballs until a release is approved.

## Packages

| Package | Responsibility |
| --- | --- |
| `cyberwave` | Generated OpenAPI types + typed Fetch transport; authentication injection, catalog/environment, workflow configuration/run helpers, legacy mission and recording read helpers and scene loading. No React or 3D dependency. |
| `@cyberwave/react` | `CyberwaveProvider`, `useCyberwave`, `useEnvironment`, `ConnectionPanel`, `EnvironmentBrowser`, `AssetBrowser`, `EnvironmentSummary`, `RecordingBrowser`, `useRecordingPlayback`, `RecordingVideo`, `WorkflowCatalog`, `WorkflowPlanner`, `WorkflowMonitor`, `InspectionVerificationPanel`; opt-in CSS tokens. |
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

Open the [asset studio](http://127.0.0.1:5173/asset-catalog.html) or [environment explorer](http://127.0.0.1:5173/environments.html). The grouped header links all **fifteen examples**, including [Cesium GIS planning](http://127.0.0.1:5173/), [mission simulation](http://127.0.0.1:5173/mission-simulation.html), [robot runtime modes](http://127.0.0.1:5173/robot-environment.html), [keyboard input](http://127.0.0.1:5173/keyboard-telecontrol.html), [camera monitoring](http://127.0.0.1:5173/twin-monitor.html), and [human actions & reviewed evidence](http://127.0.0.1:5173/human-evidence.html).

New workbenches: [aerial inspection planning](http://127.0.0.1:5173/aerial-inspection.html), [campaign and evidence review](http://127.0.0.1:5173/inspection-workbench.html), and [recording catalog/playback](http://127.0.0.1:5173/recording-review.html).

See the [example guide](examples/developer-console/README.md) for local backend, broker, and physics-worker configuration. The examples run from this repository without the private Cyberwave application.

The explorer defaults to **https://api.cyberwave.com**. Public catalog assets work anonymously. Enter a token to access authorized environments, or enter a custom HTTPS/localhost API origin. The development gateway handles API CORS, holds the token in memory for one hour and uses an HttpOnly SameSite session cookie. Use the shared **API** header on every example to connect. Switching reloads the page and clears local drafts, selections and models; export drafts first. **Reset to public** drops the previous credentials and returns to anonymous production access. Tokens are never written to browser storage or sent to model storage URLs. A production application should provide its own authenticated BFF and session lifecycle.

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

Mission writes remain available through `client.rest` using generated contracts. The examples' general connection permits remote reads and explicitly scoped local workflow/inspection writes. A saved task sequence, a scheduled execution, and a validated aircraft flight plan are separate concepts. Application services own preparation, approvals, idempotency, resource allocation and command execution.

The aerial workbench is a synthetic draft and kinematic cursor, not an autopilot or physics simulator. It distinguishes multirotor, runway/catapult fixed-wing and hybrid VTOL requirements. Coverage geometry assumes flat ground; non-AGL input is blocked pending terrain/datum conversion. It exposes runway length, turn-radius and reserve checks without declaring a route flight-ready. The inspection workbench keeps persistent defect identity separate from campaign observations, technical condition, review and maintenance priority; its local review/export data model is illustrative and is not an implemented backend API.


## Maintenance planning and verification

[Maintenance planning](http://127.0.0.1:5173/maintenance-planning.html) combines preventive/corrective proposals, work-window and sample crew-conflict checks, real saved inspection reviews, and the existing workflow planner. Its export retains API origin, immutable observation/review references and an optional workflow link. [Maintenance verification](http://127.0.0.1:5173/maintenance-verification.html) exercises replay-safe work-order updates and partial delivery coverage using synthetic browser data, plus authenticated persisted verification against stored branch evidence.

These are application examples, not new SDK or backend maintenance models. Cyberwave remains responsible for workflows/runs and inspection evidence; the application and its maintenance system own proposals, work orders and acceptance. Work-order completion alone never resolves a defect. See the [maintenance integration guide](examples/developer-console/MAINTENANCE.md) for scenarios, data ownership and missing backend contracts.


## Reusable workflow components and backend contracts

Backend definitions are the source of truth. `workflows.inputContract(id)` projects existing `metadata.editable_fields`, static node bindings and the node schema registry into labels, types, required flags, choices and edit/execute permission hints. Reference/expression/caller bindings stay in the graph editor. These are saved defaults, not a new variable or mission model. Edited literals are checked on the backend; unchanged legacy values remain editable through the existing graph workflow.

```tsx
import { WorkflowCatalog } from '@cyberwave/react';
import '@cyberwave/react/styles.css';

<WorkflowCatalog
  client={client}
  environmentId={environmentId} // or workspaceId for governance
  readOnly={false}             // application explicitly enables mutations
  serverPagination            // use with the updated backend
/>
```

`WorkflowPlanner`, `WorkflowMonitor` and `InspectionVerificationPanel` are also exported individually. Components default to read-only and have no hostname restriction; the example wrapper restricts writes to its local backend. Backend ACLs remain authoritative. Run/trigger requests now require workflow write access and recheck the existing actuation-target guard. Reader accounts can browse and monitor.

```ts
const contract = await client.workflows.inputContract(workflowId);
const page = await client.workflows.list({ workspace_uuid: workspaceId, limit: 20, offset: 0 });
const history = await client.workflows.executions(workflowId, { limit: 10, offset: 0 });
```

Pagination is opt-in for existing workflow-list callers; omission retains the old full-list behavior. Execution history defaults to 100 rows and supports paging. Stable tie-break ordering avoids ambiguous ordering for equal timestamps; this is offset pagination, not an immutable snapshot across edits. The React catalog defaults to client paging for older deployments; set `serverPagination` once the updated backend is deployed. The examples enable it on the branch backend. A missing input-contract endpoint (404) visibly falls back to legacy metadata; authentication/server errors do not silently fall back.

The planner reuses clone, node edit/conflict detection, activation, recurring triggers, execution and cancel APIs. Multi-node edits still consist of individual operations; reload an inactive draft after partial failure. There are no automatic command retries. One-off durable schedules, cross-workflow resource reservations and arbitrary dynamic allocation remain backend follow-ups.

### Generated development contracts

`schema/extensions.openapi.json` contains the preview inspection endpoints, legacy mission discovery, workflow input contract and selected workflow pagination path overrides. Regenerate it from a backend OpenAPI export with `pnpm generate --extensions-from=/path/openapi.json`. The root client's merged `paths` type gives development paths precedence over production paths; `cyberwave/generated` remains the pinned production schema. Do not edit either generated TypeScript file. Deploy the matching backend before using preview features.

### Persisted verification

A follow-up inspection can declare `target_covered: true`, `observed: false`, an evidence reference and an explanation. A `resolved` review must be validated and reference `verification_of_review_uuid`, the latest validated review of an observed finding for the same defect in an earlier imported campaign. The API checks these relations, enforces environment write access and preserves optimistic revisions/idempotent retries. Optional `work_order_reference` is an external identifier, not an acknowledgement or authenticated integration receipt.

The verification component selects stored evidence and appends this review with the authenticated identity. The backend verifies declared evidence and relationships, not the truth of media contents. Old manifests and retry hashes remain compatible. Partial campaign coverage does not prevent resolution of a covered target and does not imply delivery acceptance. See [the maintenance example](examples/developer-console/MAINTENANCE.md).


Workflow catalogs use the existing `is_template=false` list filter before server pagination when available. Keep `serverPagination` disabled for older deployments that ignore pagination/filter parameters. Typed input patches compare the input contract's exact node revision and preserve static/dynamic binding ownership; reload the configuration after a conflict. The SDK does not introduce another mission or schedule store.

## Evidence and workspace governance recipes

The [typed integration recipes](examples/recipes/README.md) compose existing generated REST APIs: workspace usage and organization credit reporting, recording-window selection as an Episode, and collection of existing Episodes into a Dataset. They add no new service facade or storage primitive. `pnpm recipes:check` checks these examples during the SDK build.

Native Dataset creation currently requires compatible robot-and-camera Episodes. Arbitrary image/video attachments need a reviewed sample-manifest adapter before they can become image-training datasets. Recognizing COCO/CVAT/YOLO on import does not mean those formats support playback or fine-tuning. Credits are organization-scoped; workspace metrics do not enforce budgets or reserve resources.

Integration guides in the documentation: [workspace governance](https://docs.cyberwave.com/enterprise/workspace-governance) and [evidence, datasets and reviewed labels](https://docs.cyberwave.com/feature-reference/datasets/evidence-and-labels). These pages are authored alongside this development branch and become available when its documentation is deployed.

### Human actions and reviewed evidence (preview)

The backend owns human-action authorization, deadlines, pause/resume and email delivery. Use the generated `client.rest` contract to list assigned workflow actions and submit a response; see [recipes](examples/recipes/human-actions.ts). A human action reuses the current workflow run, with no separate mission or task engine.

Media collections reuse Dataset and Attachment. Append is idempotent per collection/attachment, labels need an explicit review, and changed source bytes invalidate export. The platform's **Your actions** inbox handles consent and photo uploads; **Dataset → Samples** handles image and box review. The fourteenth example displays these same records through the SDK.

The [training recipe](examples/training/README.md) exports approved images and labels with source hashes and reviewer provenance. Dispatch your training worker through existing HTTP Request / Run Workflow nodes. The built-in robotics training pipeline does not yet offer a YOLO adapter; no automatic model promotion is implied.

### Capture and annotation (preview)

[Example 15](http://127.0.0.1:5173/image-annotation.html) uses `@cyberwave/react/annotation`: Annotorious-backed rectangle/polygon editing, camera/video frame capture and canonical ML-result overlays. Task schemas and image coordinates come from the backend ML registry; provider parsing stays in its adapters. Reviewed polygons reuse Dataset samples, source hashes and revision checks, and the worker recipe can export YOLO segmentation labels. See the [component and integration guide](packages/react/ANNOTATION.md).
