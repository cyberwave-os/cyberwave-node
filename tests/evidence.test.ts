import test from "node:test";
import assert from "node:assert/strict";
import { createCyberwave, CyberwaveError } from "../dist/index.js";

test("development discovery uses scoped read routes and preserves pagination filters", async () => {
  const requests: Request[] = [];
  const client = createCyberwave({
    fetch: async (input) => {
      requests.push(input as Request);
      return Response.json([]);
    },
  });
  await client.environments.missions("env", { limit: 20, offset: 40 });
  await client.missions.forWorkspace("workspace", {
    environment_uuid: "env",
    twin_uuid: "twin",
    limit: 10,
  });
  assert.equal(
    new URL(requests[0].url).pathname,
    "/api/v1/environments/env/missions",
  );
  assert.equal(new URL(requests[0].url).searchParams.get("offset"), "40");
  assert.equal(
    new URL(requests[1].url).pathname,
    "/api/v1/workspaces/workspace/missions",
  );
  assert.equal(new URL(requests[1].url).searchParams.get("twin_uuid"), "twin");
  assert.ok(requests.every((r) => r.method === "GET"));
});
test("evidence helpers share the generic routes and preserve import identity", async () => {
  const requests: Request[] = [];
  const client = createCyberwave({ fetch: async (input) => {
    requests.push(input as Request);
    return Response.json({});
  }});
  const manifest = {
    external_id: "quality-batch-1", name: "Checkpoint evidence",
    asset_reference: "station-1", reference_version: "layout-v1",
    records: [{external_id: "reading-1", subject_external_id: "checkpoint-7",
      kind: "alignment", evidence: {reference: "attachment:frame-1"}}],
  };
  await client.evidence.importCollection("env", manifest);
  await client.evidence.list("env", {limit: 10, offset: 20});
  await client.evidence.get("env", "collection");
  await client.evidence.history("env", "subject", {limit: 5, offset: 10});
  assert.deepEqual(requests.map(r => [r.method, new URL(r.url).pathname]), [
    ["POST", "/api/v1/environments/env/evidence-collections"],
    ["GET", "/api/v1/environments/env/evidence-collections"],
    ["GET", "/api/v1/environments/env/evidence-collections/collection"],
    ["GET", "/api/v1/environments/env/evidence-subjects/subject/records"],
  ]);
  assert.deepEqual(await requests[0].json(), manifest);
  assert.equal(new URL(requests[1].url).searchParams.get("offset"), "20");
  assert.equal(new URL(requests[3].url).searchParams.get("limit"), "5");
});
test("review forwards concurrency and idempotency values without automatic retry", async () => {
  const requests: Request[] = [];
  const client = createCyberwave({
    getToken: () => "test-token",
    fetch: async (input) => {
      requests.push(input as Request);
      return Response.json({ detail: "Review changed" }, { status: 409 });
    },
  });
  const payload = {
    expected_revision: 2,
    idempotency_key: "save-3",
    reason: "Original evidence checked",
    assessment: {
      decision: "validated" as const,
      severity: "medium" as const,
      priority: "planned" as const,
      technical_state: "stable" as const,
    },
  };
  await assert.rejects(
    client.evidence.review("env", "record", payload),
    (e: unknown) => e instanceof CyberwaveError && e.status === 409,
  );
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).pathname,
    "/api/v1/environments/env/evidence-records/record/reviews");
  assert.equal(requests[0].headers.get("Authorization"), "Bearer test-token");
  assert.deepEqual(await requests[0].json(), payload);
});
test("undeployed evidence API returns an explicit 404, never synthetic records", async () => {
  const client = createCyberwave({
    fetch: async () => Response.json({ detail: "Not found" }, { status: 404 }),
  });
  await assert.rejects(
    client.evidence.list("env"),
    (e: unknown) => e instanceof CyberwaveError && e.status === 404,
  );
});

test("workflow discovery keeps workspace/environment scope and reads independent execution history", async () => {
  const requests: Request[] = [];
  const client = createCyberwave({
    fetch: async (input) => {
      requests.push(input as Request);
      return Response.json([]);
    },
  });
  await client.workflows.list({
    workspace_uuid: "workspace",
    environment_uuid: "environment",
  });
  await client.workflows.executions("workflow");
  assert.equal(
    new URL(requests[0].url).searchParams.get("workspace_uuid"),
    "workspace",
  );
  assert.equal(
    new URL(requests[0].url).searchParams.get("environment_uuid"),
    "environment",
  );
  assert.equal(
    new URL(requests[1].url).pathname,
    "/api/v1/workflows/workflow/executions",
  );
  assert.ok(requests.every((request) => request.method === "GET"));
});
