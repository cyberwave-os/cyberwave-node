# Reuse existing APIs

These server-side TypeScript recipes use `client.rest` and the generated OpenAPI contract. They introduce no new SDK service, scheduler, budget balance or evidence model. Run `pnpm build:sdk` first; import the functions into an application-owned Node handler. They do not execute requests on import.

```ts
import { createCyberwave } from 'cyberwave';
import { readWorkspaceGovernance } from './governance.ts';
import { collectEpisodes, readDataset, selectEpisode } from './evidence.ts';

const client = createCyberwave({
  baseUrl: process.env.CYBERWAVE_API_URL,
  getToken: () => process.env.CYBERWAVE_API_TOKEN,
});
```

Use an application-owned session/BFF for browser applications; keep service tokens on the server. The developer-console gateway does not expose the metrics, credits, Episode or Episode-based Dataset creation routes used here. Its workflow/inspection write routes remain local-only.

## Workspace governance

`readWorkspaceGovernance(client, workspaceId, { start_timestamp, end_timestamp }, signal)` reads the workspace, derives its organization, and requests that organization's credit balance alongside workspace AI/compute/storage metrics, resource counts and the first page of scheduled workflows. Timestamps are ISO date-times; pass explicit offsets or UTC `Z`.

Every returned section is a `PromiseSettledResult`: render unavailable/denied sections as such, never as zero. Workspace access does not imply access to organization billing. Preserve decimal credit strings. Usage estimates, storage snapshots and resource counts have different units and freshness; do not add them into a purported available budget. Follow workflow pagination for the complete schedule catalog. The paginated schedule filter requires the matching development backend.

This is reporting. It does not reserve credits, robots or compute, establish workspace spending caps, or promise a scheduled start time.

## Recording selection → Dataset

1. Review the source with the [recording example](../developer-console/README.md). Use actual recording timestamps in **microseconds**, not video cursor seconds or milliseconds.
2. On an explicit save action, call `selectEpisode(client, { task_name, twins, started_at, finished_at, metadata })`. Include the recorded robot and camera twins. The backend requires source write access, full coverage and a gap-free window. This creates an Episode, not a copy of an arbitrary video file.
3. Retain the returned Episode UUID, then call `collectEpisodes(client, name, episodeIds)` as a separate action. Existing readable Episodes can be reused in multiple datasets. The backend enforces recording readiness and compatible robot/camera structure. A 409 means wait for finalization and reassess; this recipe never opts into incomplete recordings.
4. Retain the response UUID even when `status` is `failed`. Inspect it with `readDataset`; `processing_status` and failure details determine readiness. A successful POST means a row was accepted, not that conversion or training succeeded.

Mutations are not automatically retried. A timeout has an unknown outcome: reconcile existing rows before a user repeats a save. Cancellation stops waiting, not necessarily a server-side mutation. Creating an Episode and creating a Dataset are separate operations; do not promise a transaction or delete a reusable Episode after a later failure.

Native Episode-based Dataset creation remains robotics-oriented. The preview backend also supports `POST /datasets/collections` and sample append/review endpoints. `appendEvidence` reuses an existing Attachment; `approvedEvidence` paginates approved samples. Proposed labels remain pending, and changed source bytes fail approved exports.

## Human actions and image training

`human-actions.ts` lists assigned actions and submits an explicit response through generated REST calls. The backend enforces assignee access, deadlines, idempotency and resume. A photo action first uses the existing Attachment create/upload APIs, then submits its UUID with `decision: "completed"`.

The [interactive example](../developer-console/human-evidence.html) and platform inbox show these flows. The [training recipe](../training/README.md) exports reviewed images and boxes to YOLO with checksums and reviewer provenance. Use your existing HTTP Request / Run Workflow nodes to dispatch a worker; no extra training node is needed.

## Validation

`pnpm recipes:check` checks the recipes against the generated contract. `pnpm test` includes HTTP-response tests for scope, error handling, recording readiness and mutation outcomes. These checks do not claim live media conversion or training was performed.
