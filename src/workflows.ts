import type { Workflow, WorkflowNode } from "./index.js";

export type WorkflowEditableField = {
  nodeId: string;
  nodeName: string;
  name: string;
  value: unknown;
  source: "parameter" | "mapping";
};
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Existing template metadata describes configurable defaults, not arbitrary per-run variables.
 * Leave reference/expression/caller bindings intact. Bindings take precedence over parameters.
 */
export function workflowEditableFields(
  workflow: Pick<Workflow, "metadata" | "nodes">,
): WorkflowEditableField[] {
  const names = new Set(
    Array.isArray(workflow.metadata.editable_fields)
      ? workflow.metadata.editable_fields.filter(
          (name): name is string => typeof name === "string",
        )
      : [],
  );
  return (workflow.nodes ?? [])
    .filter((node) => !node.is_disabled)
    .flatMap((node) => {
      const mappings = object(node.metadata.input_mappings);
      return [...names].flatMap<WorkflowEditableField>((name) => {
        const mapping = object(mappings[name]);
        if (name in mappings)
          return mapping.mode === "value"
            ? [
                {
                  nodeId: node.uuid,
                  nodeName: node.name,
                  name,
                  value: mapping.value,
                  source: "mapping" as const,
                },
              ]
            : [];
        return Object.hasOwn(node.parameters, name)
          ? [
              {
                nodeId: node.uuid,
                nodeName: node.name,
                name,
                value: node.parameters[name],
                source: "parameter" as const,
              },
            ]
          : [];
      });
    });
}

/** Patch only declared static defaults. Preserve other fields and use the backend's edit conflict guard. */
export function workflowNodePatch(
  node: WorkflowNode,
  fields: WorkflowEditableField[],
  values: Record<string, unknown>,
) {
  const parameters = { ...node.parameters };
  const mappings = { ...object(node.metadata.input_mappings) };
  for (const field of fields.filter((field) => field.nodeId === node.uuid)) {
    if (!Object.hasOwn(values, field.name)) continue;
    if (field.source === "mapping")
      mappings[field.name] = {
        ...object(mappings[field.name]),
        value: values[field.name],
      };
    else parameters[field.name] = values[field.name];
  }
  return {
    parameters,
    metadata: {
      ...node.metadata,
      ...(Object.keys(mappings).length ? { input_mappings: mappings } : {}),
    },
    expected_updated_at: node.updated_at,
  };
}

/** Schedule rows are a projection of trigger nodes. No separate plan store. */
export function workflowSchedules(
  workflow: Pick<Workflow, "nodes" | "is_active">,
) {
  return (workflow.nodes ?? [])
    .filter(
      (node) =>
        node.node_type === "trigger" && node.trigger_type === "schedule",
    )
    .map((node) => ({
      nodeId: node.uuid,
      name: node.name,
      enabled: workflow.is_active && !node.is_disabled,
      configuration: { ...node.metadata, ...node.parameters },
    }));
}
