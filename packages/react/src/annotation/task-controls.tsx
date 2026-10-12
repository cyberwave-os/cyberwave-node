"use client";
import type { MLModel, StructuredImageAction } from "cyberwave";
import { ModelInputSummary } from "../data-catalogs.js";

/** This form uses the structured image transport, not custom io_schema ports. */
export function imageModelUnavailableReason(
  model: MLModel,
): string | undefined {
  if (model.inference_issue) return model.inference_issue;
  if (model.io_schema)
    return "This model declares custom input ports. Use its io_schema form and custom-model transport; this example runs structured image tasks.";
  if (!model.can_take_image_as_input)
    return "This model does not accept images. Choose an image-capable model.";
  if (!model.can_take_text_as_input)
    return "This model does not accept text prompts for structured image tasks.";
}

/** Controlled form: task options and prompt guidance come from the backend catalog.
 * It never submits work or transforms the user's prompt into a provider template.
 */
export function ImageModelTaskControls({
  model,
  actions,
  actionId,
  onActionChange,
  prompt,
  onPromptChange,
  imageName,
  disabled = false,
}: {
  model: MLModel;
  actions: StructuredImageAction[];
  actionId: string;
  onActionChange: (id: string) => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  imageName?: string;
  disabled?: boolean;
}) {
  const reason = imageModelUnavailableReason(model);
  const available = actions.filter(
    (action) =>
      action.image_annotation &&
      model.allowed_structured_tasks?.includes(action.id),
  );
  const action = available.find((item) => item.id === actionId);
  return (
    <section aria-label="Image model inputs">
      <ModelInputSummary model={model} />
      {reason ? (
        <p role="status">{reason}</p>
      ) : (
        <>
          <label className="cw-catalog-filter">
            Image task
            <select
              value={actionId}
              disabled={disabled || !available.length}
              onChange={(event) => onActionChange(event.target.value)}
            >
              <option value="">Select a backend task</option>
              {available.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {!available.length && (
            <p role="status">
              No supported image annotation tasks advertised by this
              model/backend.
            </p>
          )}
          {action && (
            <>
              <p>{action.description}</p>
              <p role="status">
                Image {action.requires_image ? "required" : "optional"}:{" "}
                {imageName ||
                  "choose a sample, local photo, or camera frame above"}
                .
              </p>
              <label className="cw-catalog-filter">
                Target / prompt (optional)
                <textarea
                  value={prompt}
                  disabled={disabled}
                  onChange={(event) => onPromptChange(event.target.value)}
                  rows={3}
                  placeholder="Describe the objects or regions to inspect"
                />
              </label>
              <p className="cw-muted">
                Leave blank to use the task's backend default. Cyberwave applies
                the selected model's prompt template.
              </p>
              <details>
                <summary>Backend task prompt guidance</summary>
                <pre className="cw-task-template">
                  {action.default_prompt_template}
                </pre>
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
