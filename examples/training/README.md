# Reviewed evidence → YOLO training

This worker-side recipe uses the existing Dataset, Attachment and workflow APIs.
It requires the preview backend's media collection endpoints. It does not add a
second training orchestrator or claim that the existing robotics MLTraining
pipeline supports YOLO.

1. Create two media collections in **Datasets → New media collection**.
2. Append photos using **Append to Dataset**, the SDK recipe, or the Samples tab.
   Use **Create Attachment** first for a camera/model output that is still bytes.
   For video, select frames as attachments; retain recording/timestamp provenance.
3. Review labels in **Dataset → Samples**. An approved empty label list explicitly
   marks a negative example. Proposed detector labels are never auto-approved.
4. Keep validation assets/campaigns separate from training. The exporter rejects
   identical files across splits; campaign leakage still needs a deliberate split.
5. On your training worker, install Pillow and your approved Ultralytics version.
   Configure `CYBERWAVE_API_URL` and a scoped `CYBERWAVE_API_TOKEN` in worker secrets.

```sh
python export_yolo.py --train-dataset TRAIN_UUID --validation-dataset VALIDATION_UUID --output ./inspection-v1
# Explicit opt-in to compute; use a checkpoint you have selected for your task.
python export_yolo.py --train-dataset TRAIN_UUID --validation-dataset VALIDATION_UUID --output ./inspection-v2 --model ./base-model.pt --epochs 20
```

The output includes YOLO image/label directories, `data.yaml`, and a provenance
manifest recording source hashes, sample revisions and reviewers. Private signed
media URLs are used immediately and omitted from the saved manifest. Media
requests never receive the API token. A failed export leaves an incomplete
folder; discard it and choose a new output directory before retrying. Train only
after the exporter returns successfully.

## Reuse a second workflow

Use **Schedule/Manual trigger → HTTP Request** to submit a job to your existing
training worker with `train_dataset_uuid`, `validation_dataset_uuid` and a stable
job key derived from the workflow execution. The worker calls `export_dataset`
above, trains, records model metrics and registers the result through your
existing model release process. Return a job ID promptly rather than holding an
HTTP workflow node open for training. Use **Run Workflow** when inspection should
start that dispatcher workflow. Keep Cyberwave credentials in the worker, not in
workflow inputs, exported graph JSON or the browser.

The human photo/consent action and dataset label review are separate decisions:
consent to continue a workflow does not certify training labels. Model promotion
remains an explicit validation step; this example never switches a robot's model.

Format and training references: [Ultralytics detection datasets](https://docs.ultralytics.com/datasets/detect/)
and [training mode](https://docs.ultralytics.com/modes/train/). The recipe follows
normalized `class center_x center_y width height` labels. Use licensing and model
versions appropriate for your deployment.
