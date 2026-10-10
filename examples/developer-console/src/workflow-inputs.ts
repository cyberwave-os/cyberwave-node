import {
  workflowEditableFields,
  workflowNodePatch,
  type Workflow,
} from "cyberwave";

export const workflowFieldText = (value: unknown) =>
  typeof value === "string" ? value : (JSON.stringify(value) ?? "null");

/** Validate the entire form before writing, then patch only changed static inputs.
 * In particular, editing a target must not normalize or rewrite a schedule node.
 */
export function workflowInputUpdates(
  workflow: Workflow,
  values: Record<string, string>,
) {
  const changes = workflowEditableFields(workflow).flatMap((field) => {
    const key = field.nodeId + ":" + field.name;
    if (
      !Object.hasOwn(values, key) ||
      values[key] === workflowFieldText(field.value)
    )
      return [];
    const raw = values[key];
    const value = typeof field.value === "string" ? raw : JSON.parse(raw);
    if (
      typeof field.value === "number" &&
      (typeof value !== "number" || !Number.isFinite(value))
    )
      throw new Error(field.name + " must be a number.");
    if (typeof field.value === "boolean" && typeof value !== "boolean")
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
