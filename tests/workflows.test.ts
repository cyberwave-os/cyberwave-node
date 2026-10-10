import test from "node:test";
import assert from "node:assert/strict";
import {
  createCyberwave,
  workflowEditableFields,
  workflowNodePatch,
  workflowInputUpdates,
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

test("typed backend definitions override value-based inference", () => {
  const workflow = { metadata: { editable_fields: ["speed"] }, nodes: [node] };
  const fields = workflowEditableFields(workflow, {
    workflow_uuid: "workflow",
    can_edit: true,
    can_execute: true,
    fields: [
      {
        node_uuid: node.uuid,
        node_name: "Move",
        node_updated_at: "revision-1",
        name: "speed",
        label: "Speed (m/s)",
        description: "Configured travel speed",
        type: "number",
        allowed_types: ["number"],
        required: true,
        options: [],
        value: 1,
        source: "parameter",
      },
    ],
  });
  assert.equal(fields[0].label, "Speed (m/s)");
  assert.equal(fields[0].type, "number");
  assert.equal(fields[0].required, true);
});

test("pagination and contract requests keep generated transport options", async () => {
  const requests: Request[] = [];
  const sdk = createCyberwave({
    baseUrl: "http://localhost:8008",
    fetch: async (request) => {
      requests.push(request as Request);
      return new Response(JSON.stringify([]), {
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  const controller = new AbortController();
  await sdk.workflows.list(
    { workspace_uuid: "workspace", is_template: false, limit: 20, offset: 40 },
    { signal: controller.signal },
  );
  await sdk.workflows.executions("workflow", {
    limit: 10,
    offset: 20,
    signal: controller.signal,
  });
  await sdk.workflows.inputContract("workflow", { signal: controller.signal });
  assert.equal(new URL(requests[0].url).searchParams.get("offset"), "40");
  assert.equal(
    new URL(requests[0].url).searchParams.get("is_template"),
    "false",
  );
  assert.equal(new URL(requests[1].url).searchParams.get("limit"), "10");
  assert.equal(
    new URL(requests[2].url).pathname,
    "/api/v1/workflows/workflow/input-contract",
  );
});

test("backend union types and optional nulls are accepted without flattening bindings", () => {
  const workflow = { metadata: {}, nodes: [{ ...node, metadata: {} }] };
  const fields = [
    {
      nodeId: node.uuid,
      nodeName: node.name,
      name: "speed",
      source: "parameter" as const,
      value: { x: 1 },
      type: "object",
      allowedTypes: ["object", "number"],
      required: false,
    },
  ];
  assert.equal(
    workflowInputUpdates(workflow, { [node.uuid + ":speed"]: "3" }, fields)[0]
      .patch.parameters.speed,
    3,
  );
  assert.equal(
    workflowInputUpdates(
      workflow,
      { [node.uuid + ":speed"]: "null" },
      fields,
    )[0].patch.parameters.speed,
    null,
  );
  assert.throws(
    () =>
      workflowInputUpdates(
        workflow,
        { [node.uuid + ":speed"]: "true" },
        fields,
      ),
    /type object/,
  );
});

test("a typed form cannot apply definitions from a different graph revision", () => {
  const fields = workflowEditableFields({
    metadata: { editable_fields: ["twin_uuid"] },
    nodes: [node],
  });
  fields[0].nodeUpdatedAt = "revision-0";
  assert.throws(
    () => workflowNodePatch(node, fields, { twin_uuid: "new" }),
    /definitions changed/,
  );
  fields[0].nodeUpdatedAt = node.updated_at;
  assert.equal(
    workflowNodePatch(node, fields, { twin_uuid: "new" }).expected_updated_at,
    node.updated_at,
  );
});

test("a stale form cannot replace a new dynamic binding or create a removed input", () => {
  const fields = workflowEditableFields({
    metadata: { editable_fields: ["twin_uuid"] },
    nodes: [node],
  });
  const rebound = {
    ...node,
    metadata: {
      input_mappings: {
        twin_uuid: {
          mode: "reference",
          source_node_uuid: "upstream",
          source_output: "twin_uuid",
        },
      },
    },
  };
  assert.throws(
    () => workflowNodePatch(rebound, fields, { twin_uuid: "new" }),
    /bindings changed/,
  );
  assert.throws(
    () =>
      workflowNodePatch({ ...node, metadata: {} }, fields, {
        twin_uuid: "new",
      }),
    /bindings changed/,
  );
  assert.throws(
    () =>
      workflowNodePatch(node, [{ ...fields[0], source: "parameter" }], {
        twin_uuid: "new",
      }),
    /bindings changed/,
  );
});

test("legacy value mappings use the same default mode as the backend runtime", () => {
  const legacy = {
    ...node,
    metadata: { input_mappings: { twin_uuid: { value: "bound" } } },
  };
  const fields = workflowEditableFields({
    metadata: { editable_fields: ["twin_uuid"] },
    nodes: [legacy],
  });
  assert.equal(fields[0].source, "mapping");
  assert.equal(
    workflowNodePatch(legacy, fields, { twin_uuid: "new" }).metadata
      .input_mappings.twin_uuid.value,
    "new",
  );
});

test("an optional enum permits null like the backend contract", () => {
  const workflow = { metadata: {}, nodes: [{ ...node, metadata: {} }] };
  const fields = [
    {
      nodeId: node.uuid,
      nodeName: node.name,
      name: "speed",
      source: "parameter" as const,
      value: 1,
      type: "number",
      required: false,
      options: [{ value: "other", label: "Other" }],
    },
  ];
  assert.equal(
    workflowInputUpdates(workflow, { "step:speed": "null" }, fields)[0].patch
      .parameters.speed,
    null,
  );
});

test("malformed mappings are not treated as editable literals", () => {
  for (const binding of [null, [], "invalid"]) {
    const broken = {
      ...node,
      metadata: { input_mappings: { twin_uuid: binding } },
    };
    assert.deepEqual(
      workflowEditableFields({
        metadata: { editable_fields: ["twin_uuid"] },
        nodes: [broken],
      }),
      [],
    );
  }
});
