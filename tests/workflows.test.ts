import test from "node:test";
import assert from "node:assert/strict";
import {
  createCyberwave,
  workflowEditableFields,
  workflowNodePatch,
  workflowSchedules,
  type WorkflowNode,
} from "../dist/index.js";
const node = {
  uuid: "step",
  name: "Move",
  parameters: { twin_uuid: "old", speed: 1, unrelated: true },
  metadata: {
    input_mappings: {
      twin_uuid: { mode: "value", value: "bound" },
      speed: { mode: "reference", source_node: "upstream" },
    },
  },
  updated_at: "revision-1",
} as unknown as WorkflowNode;
test("template form honors static bindings and never overwrites dynamic inputs", () => {
  const fields = workflowEditableFields({
    metadata: { editable_fields: ["twin_uuid", "speed", "missing"] },
    nodes: [node],
  });
  assert.deepEqual(
    fields.map((f) => [f.name, f.value, f.source]),
    [["twin_uuid", "bound", "mapping"]],
  );
  const patch = workflowNodePatch(node, fields, { twin_uuid: "new", speed: 9 });
  assert.equal(patch.parameters.twin_uuid, "old");
  assert.equal(patch.parameters.speed, 1);
  assert.equal(patch.metadata.input_mappings.twin_uuid.value, "new");
  assert.deepEqual(
    patch.metadata.input_mappings.speed,
    node.metadata.input_mappings.speed,
  );
  assert.equal(patch.expected_updated_at, "revision-1");
});
test("schedule projection includes paused triggers and parameter precedence", () => {
  const trigger = {
    ...node,
    node_type: "trigger",
    trigger_type: "schedule",
    is_disabled: false,
    metadata: { cron: "old" },
    parameters: { cron: "0 9 * * *", timezone: "UTC" },
  };
  assert.equal(
    workflowSchedules({ is_active: false, nodes: [trigger] })[0].enabled,
    false,
  );
  assert.equal(
    workflowSchedules({
      is_active: true,
      nodes: [{ ...trigger, is_disabled: true }],
    })[0].enabled,
    false,
  );
  assert.equal(
    workflowSchedules({ is_active: true, nodes: [trigger] })[0].configuration
      .cron,
    "0 9 * * *",
  );
});
test("workflow mutations use existing endpoints, preserve conflicts, and never retry execution", async () => {
  const requests: Request[] = [];
  const client = createCyberwave({
    fetch: async (input) => {
      const request = input as Request;
      requests.push(request);
      return request.url.endsWith("/execute")
        ? Response.json({ detail: "Conflict" }, { status: 409 })
        : Response.json({ uuid: "draft" });
    },
  });
  await client.workflows.clone("template", {
    name: "Draft",
    environment_uuid: "env",
  });
  await client.workflows.updateNode("draft", "step", {
    parameters: { speed: 2 },
    expected_updated_at: "r1",
  });
  await client.workflows.activate("draft");
  await assert.rejects(client.workflows.execute("draft", { target: "robot" }));
  await client.workflows.cancel("run");
  assert.deepEqual(
    requests.map((r) => r.method),
    ["POST", "PUT", "POST", "POST", "POST"],
  );
  assert.equal(
    new URL(requests[1].url).pathname,
    "/api/v1/workflows/draft/nodes/step",
  );
  assert.equal((await requests[1].json()).expected_updated_at, "r1");
  assert.deepEqual(await requests[3].json(), {
    trigger_data: { target: "robot" },
  });
  assert.equal(
    new URL(requests[4].url).pathname,
    "/api/v1/workflows/executions/run/cancel",
  );
});
