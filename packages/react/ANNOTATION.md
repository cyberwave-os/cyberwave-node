# Capture, annotate, review

The optional `@cyberwave/react/annotation` entry provides image tools without adding an annotation service or a second model catalog. Try [example 15](http://127.0.0.1:5173/image-annotation.html) with the [developer-console setup](../../examples/developer-console/README.md).

```tsx
import { useState } from 'react';
import type { SampleAnnotation } from 'cyberwave';
import { ImageAnnotationEditor } from '@cyberwave/react/annotation';
import '@cyberwave/react/styles.css';
import '@cyberwave/react/annotation.css';

type ReviewProps = {
  imageUrl: string;
  // Include session, sample ID and revision; never include a token.
  sourceKey: string;
  saveReview: (labels: SampleAnnotation[]) => void;
};
function Review(props: ReviewProps) {
  return <ReviewDraft key={props.sourceKey} {...props} />;
}
function ReviewDraft({ imageUrl, saveReview }: ReviewProps) {
  const [annotations, setAnnotations] = useState<SampleAnnotation[]>([]);
  const [valid, setValid] = useState(false);
  return <>
    <ImageAnnotationEditor src={imageUrl} value={annotations}
      onChange={setAnnotations} onValidityChange={setValid} />
    <button disabled={!valid} onClick={() => saveReview(annotations)}>Save reviewed labels</button>
  </>;
}
// Your saveReview handler uses the existing sample review endpoint and revision.
// Change sourceKey on account/sample/revision changes to discard old labels.
// Import ImageCapture separately for local camera capture.
```

For a complete capture-review step, use `CapturedFrameReview` with a `CapturedFrame`
and an `onConfirm({ frame, annotations }, signal)` handler. It reuses this editor,
releases preview URLs when the frame changes, and supplies pending/error states
for the application's handoff. See the [camera composition guide](../../docs/custom-ui.md#compose-a-camera-console-and-a-live-sensor-panel)
and [example 16](http://127.0.0.1:5173/sensor-video.html) for video capture, review,
PNG download and annotation export. Keep source identity alongside the frame;
the host still owns upload and dataset policy.

## One coordinate and storage boundary

- The editor uses [Annotorious](https://annotorious.dev/api-reference/shape/) for drawing, selection, rectangle resize and polygon vertex editing. Its pixel coordinates are converted at the SDK boundary to `SampleAnnotation`: `bbox: [left, top, right, bottom]` and optional `polygon: [[x,y], ...]`, normalized to `[0,1]` against the original image dimensions.
- Choose **Select / edit**, **Rectangle** or **Polygon**. Set a label before drawing or select a region and apply a new label. `onValidityChange(false)` blocks host saves when an image or region cannot be represented. Removing every region is a valid, deliberate negative sample.
- The backend validates labels, bounds and 3–128 polygon vertices and derives the enclosing box from the polygon. These are single-ring polygons; holes, multipolygons, brush masks, tracks and topology repair are not supported. Keep boundaries simple and non-self-intersecting.
- The host owns persistence. Upload bytes through the existing Attachment API, append to a Dataset media collection, and explicitly review through `POST /datasets/{uuid}/samples/{sample_uuid}/review` with the current revision. Conflicts require reloading. Keep source SHA-256 and frame provenance with the sample. Approval is never inferred from drawing or running a model.

`captureVideoFrame(video)` returns a PNG from the decoded frame of an existing camera, recording or WebRTC video element. `mediaTime` is seconds in that media element, not a recording timestamp. Use the track's actual anchor and `mediaSecondsToTimestampUs` when retaining recording provenance. The source must be same-origin or CORS enabled; an overlay is not baked into the captured image. `ImageCapture` requests the camera only on an explicit click and stops owned tracks on stop/unmount. Revoke any object URLs your application creates.

## Select a model and its inputs

Example 15 uses `ModelBrowser` from the main React entry, then `loadImageModelTasks` to retrieve the selected model and canonical task catalog. Users select names; UUID input is tucked into **Open a model by UUID**.

```tsx
import { ImageModelTaskControls } from '@cyberwave/react/annotation';
<ImageModelTaskControls model={loaded.model} actions={loaded.actions}
  actionId={taskId} onActionChange={setTaskId}
  prompt={prompt} onPromptChange={setPrompt}
  imageName={selectedImage.name} disabled={submitting || jobUnfinished} />
```

This controlled form shows the model's accepted modalities and requirements, available image tasks, task description, selected image and optional target prompt. Blank prompt uses the task's backend default; provider-specific templates remain server-side. Changing tasks should clear the host's prompt/result so a prior request cannot be mistaken for the next one. The example locks source/model/task selection until an accepted execution finishes or fails; stopping monitoring does not unlock a running job.

The form is intentionally scoped to the structured image transport. Text-only/audio-only models show why they cannot run here. Models with custom `io_schema` expose their named, typed, required inputs but are not submitted using `image_base64` plus `prompt`; their custom transport must be handled by its adapter. `imageModelUnavailableReason(model)` gives hosts the same guard for the Run button. Models accepting images but advertising no image geometry tasks remain visible with that explanation. No provider list or task IDs are copied into the form.

## Backend ML adapters remain authoritative

```ts
import { loadImageModelTasks, runImageModelTask, modelBoxProposals } from '@cyberwave/react/annotation';
const { actions } = await loadImageModelTasks(client, modelUuid);
const selected = actions.find(action => action.id === selectedTaskId);
if (!selected) throw new Error('Select an available image task');
const result = await runImageModelTask(client, modelUuid, selected, imageBlob, prompt);
// Render <ModelResultOverlay src={imageUrl} action={selected} result={result} />.
// For a box task, explicitly import editable proposals; they still need review:
const proposals = modelBoxProposals(selected, result);
```

The generated client reads `GET /mlmodels/structured-actions` and intersects its actions with the model's `allowed_structured_tasks`. The canonical registry now advertises optional `image_annotation` metadata (version, kind, coordinate order and scale). Provider normalization stays in Cyberwave's existing backend task adapters. The UI validates canonical output against the returned JSON Schema with Ajv, then renders points, boxes, masks or image trajectories. Unknown contracts, provider text and out-of-range geometry fail visibly. Image trajectories are pixels, not robot commands.

Use the authenticated public model `run` API. A model call can consume credits; no inference starts automatically. Adjust `createCyberwave({ timeoutMs })` to your application's per-request inference budget. If the server accepts asynchronous work, `runImageModelTask` monitors the existing execution endpoint until completion and validates its canonical result. Submission is never retried, and server-provided `poll_url` values are not followed. The sample gateway allows model runs only against an authenticated local API, permits bounded image payloads, and keeps remote connections read-only.

```ts
import { waitForImageModelTask } from '@cyberwave/react/annotation';
const controller = new AbortController();
const result = await runImageModelTask(client, modelUuid, selected, imageBlob,
  prompt, controller.signal, {
    timeoutMs: 300_000, // Total monitoring budget; each API read also has the client timeout.
    pollIntervalMs: 1500,
    onQueued: executionUuid => savePendingJob({ executionUuid, sourceId, taskId: selected.id }),
    onProgress: execution => showStatus(execution.status),
  });
// On stop/unmount: controller.abort(). The server job continues.
// Resume the same accepted job with its original source image and catalog task:
const resumed = await waitForImageModelTask(client, savedJob.executionUuid, selected);
```

`client.mlmodels.run`, `.execution` and `.waitForExecution` provide the same transport and monitoring for non-React consumers and non-image models. Monitoring defaults to five minutes, reads sequentially, returns completed/failed records, and surfaces HTTP errors without retrying. The image helper turns failed executions and invalid geometry into errors. Missing execution IDs, unsupported statuses, absent results and incompatible tasks remain visible failures. A timeout or lost submission response does not prove the server stopped; reconcile with model history before starting again. Custom hosted models still need a backend adapter that produces the advertised image contract; polling does not convert arbitrary port payloads into geometry.

Example 15 shows the execution ID, status, **Stop monitoring** and **Resume monitoring**. Its resume handle lasts while that page, API connection, source image and selected task remain selected. Applications that need reload recovery should persist the accepted ID with the original source identity and task, then restore all three together. Results remain proposals until explicitly reviewed.

Segmentation output remains a canonical PNG mask within its box. It can be displayed or exported as a model result, but is **not** silently converted into box or polygon labels. Draw and review a polygon for the current dataset segmentation path. Automatic contour extraction and point-prompt segmentation need a separately reviewed adapter contract; do not add browser provider parsers to simulate support. [Annotorious's SAM plugin](https://github.com/annotorious/plugin-segment-anything) is a possible future renderer integration, but loading a separate browser model would bypass the platform's current model selection, credentials and execution accounting.

## Training and packaging

The [worker export recipe](../../examples/training/README.md) supports `--task detect` and `--task segment`. Segment mode requires an actual reviewed polygon for every object; detect mode uses the enclosing boxes. It retains source hashes, sample revisions and reviewer provenance and rejects overlapping train/validation images. Training still runs on your worker.

The annotation entry lazy-loads Annotorious only after an image loads. Plain `cyberwave` and the main React entry do not pull in the editor. Importing the annotation entry is safe during server rendering; interactive components run on the client. Annotorious is [BSD-3-Clause](https://github.com/annotorious/annotorious/blob/main/LICENSE); Ajv is MIT. Their installed packages retain their license files. No vendor code is copied into Cyberwave.
