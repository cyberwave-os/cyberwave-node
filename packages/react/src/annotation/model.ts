import { Ajv } from "ajv";
import {
  CyberwaveError,
  type CyberwaveClient,
  type SampleAnnotation,
  type StructuredImageAction,
  type StructuredActionCatalog,
  type components,
  type ModelExecutionOptions,
} from "cyberwave";

export type ImageModelResult = {
  status: string;
  output_format: string;
  output: unknown;
  structured_task?: string | null;
};
export type ImageMark = {
  label: string;
  bbox?: number[];
  point?: number[];
  mask?: string;
};
export type ImageModelRunOptions = Omit<ModelExecutionOptions, "signal"> & {
  /** Persist this ID with the source image and selected task to resume monitoring. */
  onQueued?: (executionUuid: string) => void;
};
const validator = new Ajv({ strict: false });

/** Consume already normalized backend output. Never parse provider text in the browser. */
export function imageMarks(
  action: StructuredImageAction,
  result: ImageModelResult,
): ImageMark[] {
  const contract = action.image_annotation;
  if (
    !contract ||
    contract.version !== 1 ||
    contract.coordinate_order !== "yx" ||
    !Number.isFinite(contract.coordinate_scale) ||
    contract.coordinate_scale <= 0
  )
    throw new Error(
      "Unsupported image annotation contract. Refresh the backend task catalog.",
    );
  if (
    result.status !== "completed" ||
    result.output_format !== action.output_format ||
    (result.structured_task && result.structured_task !== action.id)
  )
    throw new Error(
      "The result does not match the selected completed model task.",
    );
  if (
    !validator.validate(action.output_schema, result.output) ||
    !Array.isArray(result.output) ||
    result.output.length > 500
  )
    throw new Error(
      "Model output violates the backend task schema. Check the provider adapter.",
    );
  const scale = contract.coordinate_scale;
  const unit = (value: unknown) => {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > scale
    )
      throw new Error("Image coordinates are outside the task contract.");
    return value / scale;
  };
  let maskBytes = 0;
  return result.output.map((row: Record<string, unknown>) => {
    const mark: ImageMark = {
      label: typeof row.label === "string" ? row.label : "",
    };
    if (contract.kind === "points" || contract.kind === "trajectory") {
      const [y, x] = row.point as number[];
      mark.point = [unit(x), unit(y)];
    } else if (contract.kind === "boxes" || contract.kind === "masks") {
      const [top, left, bottom, right] = row.box_2d as number[];
      mark.bbox = [unit(left), unit(top), unit(right), unit(bottom)];
      if (mark.bbox[2] <= mark.bbox[0] || mark.bbox[3] <= mark.bbox[1])
        throw new Error("Image boxes must have positive area.");
      if (contract.kind === "masks") {
        const raw = String(row.mask).replace(/^data:image\/png;base64,/, "");
        maskBytes += raw.length;
        if (
          maskBytes > 12 * 1024 * 1024 ||
          !/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(raw)
        )
          throw new Error(
            "Masks must be bounded base64 PNGs from the canonical task adapter.",
          );
        mark.mask = `data:image/png;base64,${raw}`;
      }
    } else throw new Error("Unsupported image geometry.");
    return mark;
  });
}

/** Only real box results become box proposals; masks/points are never silently flattened. */
export function modelBoxProposals(
  action: StructuredImageAction,
  result: ImageModelResult,
): SampleAnnotation[] {
  if (action.image_annotation?.kind !== "boxes")
    throw new Error(
      "Only box tasks can seed dataset box proposals. Review masks as masks or draw a polygon.",
    );
  return imageMarks(action, result).map((mark) => ({
    label: mark.label,
    bbox: mark.bbox!,
  }));
}

export async function loadImageModelTasks(
  client: CyberwaveClient,
  modelUuid: string,
  signal?: AbortSignal,
): Promise<{
  model: components["schemas"]["MLModelSchema"];
  actions: StructuredImageAction[];
}> {
  const [catalog, model] = await Promise.all([
    client.rest.GET("/api/v1/mlmodels/structured-actions", { signal }),
    client.mlmodels.get(modelUuid, { signal }),
  ]);
  if (!catalog.response.ok)
    throw new CyberwaveError(catalog.response.status, catalog.error);
  const actions = (catalog.data as StructuredActionCatalog).actions.filter(
    (action) =>
      action.image_annotation &&
      model.allowed_structured_tasks?.includes(action.id),
  );
  return { model, actions };
}

export async function runImageModelTask(
  client: CyberwaveClient,
  modelUuid: string,
  action: StructuredImageAction,
  image: Blob,
  prompt = "",
  signal?: AbortSignal,
  options: ImageModelRunOptions = {},
): Promise<ImageModelResult> {
  if (
    image.size > 20 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(image.type)
  )
    throw new Error("Use a JPEG, PNG or WebP image up to 20 MB.");
  const imageBase64 = await new Promise<string>((resolve, reject) => {
    signal?.throwIfAborted();
    const reader = new FileReader();
    const abort = () => {
      reader.abort();
      reject(signal!.reason);
    };
    const cleanup = () => signal?.removeEventListener("abort", abort);
    reader.onload = () => {
      cleanup();
      resolve(String(reader.result).split(",")[1]);
    };
    reader.onerror = () => {
      cleanup();
      reject(new Error("Could not read the image."));
    };
    signal?.addEventListener("abort", abort, { once: true });
    reader.readAsDataURL(image);
  });
  signal?.throwIfAborted();
  const response = await client.mlmodels.run(
    modelUuid,
    { structured_task: action.id, image_base64: imageBase64, prompt },
    { signal },
  );
  if (response.status === "queued") {
    const uuid = response.execution_uuid;
    if (!uuid)
      throw new Error(
        "The server queued work without an execution ID. Check model history before submitting again.",
      );
    options.onQueued?.(uuid);
    return waitForImageModelTask(client, uuid, action, { ...options, signal });
  }
  const result = response as ImageModelResult;
  imageMarks(action, result); // Fail closed before any result is presented as geometry.
  return result;
}

/** Resume the accepted execution for this image/task; no second inference request. */
export async function waitForImageModelTask(
  client: CyberwaveClient,
  executionUuid: string,
  action: StructuredImageAction,
  options: ModelExecutionOptions = {},
): Promise<ImageModelResult> {
  const execution = await client.mlmodels.waitForExecution(executionUuid, options);
  if (execution.status === "failed")
    throw new Error(execution.error_message || "Model execution failed.");
  if (execution.request_payload.structured_task !== action.id)
    throw new Error("The execution belongs to a different image task.");
  if (!execution.result)
    throw new Error("Completed execution has no model result.");
  const result = execution.result as ImageModelResult;
  imageMarks(action, result);
  return result;
}
