import test from "node:test";
import assert from "node:assert/strict";
import type { Workflow } from "../dist/index.js";
import { workflowInputUpdates } from "../dist/index.js";

const workflow = {
  metadata: { editable_fields: ["duration", "twin_uuid", "speed"] },
  nodes: [
    {
      uuid: "schedule",
      node_type: "trigger",
      trigger_type: "schedule",
      parameters: { interval: 5, unit: "minutes" },
      metadata: {},
      updated_at: "s1",
    },
    {
      uuid: "wait",
      name: "Wait",
      parameters: { duration: 3 },
      metadata: {},
      updated_at: "w1",
    },
    {
      uuid: "move",
      name: "Move",
      parameters: { twin_uuid: "old", speed: 2 },
      metadata: {
        input_mappings: {
          twin_uuid: { mode: "value", value: "bound" },
          speed: { mode: "reference", source_node: "start" },
        },
      },
      updated_at: "m1",
    },
  ],
} as unknown as Workflow;
test("editing an input preserves the existing interval schedule and untouched nodes", () => {
  const updates = workflowInputUpdates(workflow, {
    "wait:duration": "4",
    "move:twin_uuid": "bound",
  });
  assert.deepEqual(
    updates.map((u) => u.nodeId),
    ["wait"],
  );
  assert.equal(updates[0].patch.parameters.duration, 4);
  assert.equal(updates[0].patch.expected_updated_at, "w1");
});
test("a static target change keeps dynamic bindings and unrelated parameters intact", () => {
  const [update] = workflowInputUpdates(workflow, {
    "move:twin_uuid": "new",
    "move:speed": "100",
  });
  assert.equal(update.patch.metadata.input_mappings.twin_uuid.value, "new");
  assert.deepEqual(update.patch.metadata.input_mappings.speed, {
    mode: "reference",
    source_node: "start",
  });
  assert.equal(update.patch.parameters.speed, 2);
});
test("invalid field types fail before the caller can send any update", () => {
  assert.throws(
    () =>
      workflowInputUpdates(workflow, {
        "wait:duration": '"four"',
        "move:twin_uuid": "new",
      }),
    /must be a number/,
  );
  assert.throws(
    () => workflowInputUpdates(workflow, { "wait:duration": "1e309" }),
    /must be a number/,
  );
});
test("an unchanged form generates no writes", () => {
  assert.deepEqual(
    workflowInputUpdates(workflow, {
      "wait:duration": "3",
      "move:twin_uuid": "bound",
    }),
    [],
  );
});
