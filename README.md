# Cyberwave JavaScript SDK

The official [`cyberwave`](https://www.npmjs.com/package/cyberwave) package for Node.js and browser applications, with optional React components and a 3D renderer. This is the next increment of [cyberwave-node](https://github.com/cyberwave-os/cyberwave-node), retaining its package identity and Apache-2.0 license.

**Release status:** this branch prepares `0.1.0`. The published `0.0.1` package is the earlier placeholder; installing it from npm does not install this implementation. Build from this checkout or install the locally packed tarballs until a release is approved.

## Packages

| Package | Responsibility |
| --- | --- |
| `cyberwave` | Generated OpenAPI types + typed Fetch transport; authentication injection, catalog/environment helpers and scene loading. No React or 3D dependency. |
| `@cyberwave/react` | `CyberwaveProvider`, `useCyberwave`, `useEnvironment`, `ConnectionPanel`, `EnvironmentBrowser`, `AssetBrowser`, `EnvironmentSummary`; opt-in CSS tokens. |
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

Open the [asset studio](http://127.0.0.1:5173/asset-catalog.html) or [environment explorer](http://127.0.0.1:5173/environments.html). The grouped header links all **seven examples**, including [Cesium GIS planning](http://127.0.0.1:5173/), [mission simulation](http://127.0.0.1:5173/mission-simulation.html), [robot runtime modes](http://127.0.0.1:5173/robot-environment.html), [keyboard input](http://127.0.0.1:5173/keyboard-telecontrol.html), and [camera monitoring](http://127.0.0.1:5173/twin-monitor.html).

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
