import type { Workflow, WorkflowNode, WorkflowInputContract } from "./index.js";

export type WorkflowEditableField = {
  nodeId: string;
  nodeName: string;
  name: string;
  value: unknown;
  source: "parameter" | "mapping";
  type?: string;
  allowedTypes?: string[];
  label?: string;
  description?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
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
  contract?: WorkflowInputContract,
): WorkflowEditableField[] {
  if (contract)
    return contract.fields.map((field) => ({
      nodeId: field.node_uuid,
      nodeName: field.node_name,
      name: field.name,
      value: field.value,
      source: field.source,
      type: field.type,
      allowedTypes: field.allowed_types,
      label: field.label,
      description: field.description,
      required: field.required,
      options: field.options,
    }));
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

export const workflowFieldText = (value: unknown) =>
  typeof value === "string" ? value : (JSON.stringify(value) ?? "null");

/** Validate the entire form before writing, then patch only changed static inputs.
 * In particular, editing a target must not normalize or rewrite a schedule node.
 */
export function workflowInputUpdates(
  workflow: Pick<Workflow, "metadata" | "nodes">,
  values: Record<string, string>,
  fields = workflowEditableFields(workflow),
) {
  const changes = fields.flatMap((field) => {
    const key = field.nodeId + ":" + field.name;
    if (
      !Object.hasOwn(values, key) ||
      values[key] === workflowFieldText(field.value)
    )
      return [];
    const raw = values[key];
    const type = field.type ?? typeof field.value;
    const value = [
      "string",
      "image",
      "video",
      "audio",
      "glb",
      "bytes",
    ].includes(type)
      ? raw
      : JSON.parse(raw);
    if (field.type) {
      const normalize = (type: string) =>
        type === "dict"
          ? "object"
          : ["image", "audio", "video", "glb", "bytes"].includes(type)
            ? "string"
            : type;
      const allowed = (field.allowedTypes ?? [field.type]).map(normalize);
      const actual = Array.isArray(value) ? "array" : typeof value;
      if (
        !(value === null && !field.required) &&
        !allowed.includes("json") &&
        (value === null || !allowed.includes(actual))
      )
        throw new Error(field.name + " must have type " + field.type + ".");
      if (typeof value === "number" && !Number.isFinite(value))
        throw new Error(field.name + " must be finite.");
      if (
        field.options?.length &&
        !field.options.some((option) => option.value === value)
      )
        throw new Error(field.name + " must be one of the declared options.");
    } else {
      if (
        type === "number" &&
        (typeof value !== "number" || !Number.isFinite(value))
      )
        throw new Error(field.name + " must be a number.");
      if (type === "boolean" && typeof value !== "boolean")
        throw new Error(field.name + " must be true or false.");
      if (
        field.value !== null &&
        typeof field.value === "object" &&
        (value === null ||
          typeof value !== "object" ||
          Array.isArray(value) !== Array.isArray(field.value))
      )
        throw new Error(
          field.name + " must preserve its JSON object/array shape.",
        );
    }
    return [{ field, value }];
  });
  return (workflow.nodes ?? []).flatMap((node) => {
    const bound = changes.filter((change) => change.field.nodeId === node.uuid);
    return bound.length
      ? [
          {
            nodeId: node.uuid,
            patch: workflowNodePatch(
              node,
              bound.map((change) => change.field),
              Object.fromEntries(
                bound.map((change) => [change.field.name, change.value]),
              ),
            ),
          },
        ]
      : [];
  });
}
