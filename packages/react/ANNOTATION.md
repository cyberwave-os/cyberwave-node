# Capture, annotate, review

The optional `@cyberwave/react/annotation` entry provides image tools without adding an annotation service or a second model catalog. Try [example 15](http://127.0.0.1:5173/image-annotation.html) with the [developer-console setup](../../examples/developer-console/README.md).

```tsx
import { useState } from 'react';
import type { SampleAnnotation } from 'cyberwave';
import { ImageAnnotationEditor, ImageCapture } from '@cyberwave/react/annotation';
import '@cyberwave/react/styles.css';
import '@cyberwave/react/annotation.css';

function Review({ imageUrl, saveReview }: {
  imageUrl: string; saveReview: (labels: SampleAnnotation[]) => void;
}) {
  const [annotations, setAnnotations] = useState<SampleAnnotation[]>([]);
  const [valid, setValid] = useState(false);
  return <>
    <ImageAnnotationEditor src={imageUrl} value={annotations}
      onChange={setAnnotations} onValidityChange={setValid} />
    <button disabled={!valid} onClick={() => saveReview(annotations)}>Save reviewed labels</button>
  </>;
}
// Your saveReview handler uses the existing sample review endpoint and revision.
// ImageCapture onCapture receives {blob, width, height, mediaTime, capturedAt}.
```

## One coordinate and storage boundary

- The editor uses [Annotorious](https://annotorious.dev/api-reference/shape/) for drawing, selection, rectangle resize and polygon vertex editing. Its pixel coordinates are converted at the SDK boundary to `SampleAnnotation`: `bbox: [left, top, right, bottom]` and optional `polygon: [[x,y], ...]`, normalized to `[0,1]` against the original image dimensions.
- Choose **Select / edit**, **Rectangle** or **Polygon**. Set a label before drawing or select a region and apply a new label. `onValidityChange(false)` blocks host saves when an image or region cannot be represented. Removing every region is a valid, deliberate negative sample.
- The backend validates labels, bounds and 3–128 polygon vertices and derives the enclosing box from the polygon. These are single-ring polygons; holes, multipolygons, brush masks, tracks and topology repair are not supported. Keep boundaries simple and non-self-intersecting.
- The host owns persistence. Upload bytes through the existing Attachment API, append to a Dataset media collection, and explicitly review through `POST /datasets/{uuid}/samples/{sample_uuid}/review` with the current revision. Conflicts require reloading. Keep source SHA-256 and frame provenance with the sample. Approval is never inferred from drawing or running a model.

`captureVideoFrame(video)` returns a PNG from the decoded frame of an existing camera, recording or WebRTC video element. `mediaTime` is seconds in that media element, not a recording timestamp. Use the track's actual anchor and `mediaSecondsToTimestampUs` when retaining recording provenance. The source must be same-origin or CORS enabled; an overlay is not baked into the captured image. `ImageCapture` requests the camera only on an explicit click and stops owned tracks on stop/unmount. Revoke any object URLs your application creates.

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

Use the authenticated public model `run` API. A model call can consume credits; no inference starts automatically. Adjust `createCyberwave({ timeoutMs })` to your application's inference budget. Queued jobs return an actionable execution ID in the error; this first helper does not poll them or automatically resubmit requests. The sample gateway allows model runs only against an authenticated local API, permits bounded image payloads, and keeps remote connections read-only.

Segmentation output remains a canonical PNG mask within its box. It can be displayed or exported as a model result, but is **not** silently converted into box or polygon labels. Draw and review a polygon for the current dataset segmentation path. Automatic contour extraction and point-prompt segmentation need a separately reviewed adapter contract; do not add browser provider parsers to simulate support. [Annotorious's SAM plugin](https://github.com/annotorious/plugin-segment-anything) is a possible future renderer integration, but loading a separate browser model would bypass the platform's current model selection, credentials and execution accounting.

## Training and packaging

The [worker export recipe](../../examples/training/README.md) supports `--task detect` and `--task segment`. Segment mode requires an actual reviewed polygon for every object; detect mode uses the enclosing boxes. It retains source hashes, sample revisions and reviewer provenance and rejects overlapping train/validation images. Training still runs on your worker.

The annotation entry lazy-loads Annotorious only after an image loads. Plain `cyberwave` and the main React entry do not pull in the editor. Importing the annotation entry is safe during server rendering; interactive components run on the client. Annotorious is [BSD-3-Clause](https://github.com/annotorious/annotorious/blob/main/LICENSE); Ajv is MIT. Their installed packages retain their license files. No vendor code is copied into Cyberwave.
