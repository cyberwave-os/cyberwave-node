import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  type CyberwaveClient,
  type DatasetSample,
  type SampleAnnotation,
  type StructuredImageAction,
} from "cyberwave";
import {
  ImageAnnotationEditor,
  ImageCapture,
  ModelResultOverlay,
  loadImageModelTasks,
  runImageModelTask,
  modelBoxProposals,
  type ImageModelResult,
} from "@cyberwave/react/annotation";
import { ConnectedWorkbench, downloadJson } from "./workbench-connection.tsx";
import { mediaUrl } from "./connection.ts";
import "@cyberwave/react/styles.css";
import "@cyberwave/react/annotation.css";
import "./workbench.css";

type Source = {
  url: string;
  name: string;
  blob?: Blob;
  sample?: DatasetSample;
  dataset?: string;
  capture?: { mediaTime: number; capturedAt: string };
};
function AnnotationWorkbench({ client }: { client: CyberwaveClient }) {
  const [source, setSource] = useState<Source>(),
    [draft, setDraft] = useState<SampleAnnotation[]>([]),
    [dataset, setDataset] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [valid, setValid] = useState(false);
  const [model, setModel] = useState(""),
    [resolvedModel, setResolvedModel] = useState(""),
    [actions, setActions] = useState<StructuredImageAction[]>([]),
    [actionId, setActionId] = useState(""),
    [prompt, setPrompt] = useState(""),
    [result, setResult] = useState<{
      action: StructuredImageAction;
      value: ImageModelResult;
    }>();
  const action = actions.find((a) => a.id === actionId);
  useEffect(
    () => () => {
      if (source?.url.startsWith("blob:")) URL.revokeObjectURL(source.url);
    },
    [source?.url],
  );
  function choose(next: Source) {
    setSource(next);
    setDraft(next.sample?.annotations || []);
    setResult(undefined);
    setNotice("");
    setError("");
  }
  async function perform(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadSample() {
    const page = await client.datasets.samples(dataset.trim(), { limit: 1 });
    const sample = page.items[0];
    if (!sample?.file_url)
      throw new Error("No readable unchanged sample found in this collection.");
    choose({
      url: mediaUrl(sample.file_url),
      name: "Dataset sample",
      sample,
      dataset: dataset.trim(),
    });
  }
  async function approve() {
    if (!source?.sample || !source.dataset) return;
    const sample = await client.datasets.reviewSample(
      source.dataset,
      source.sample.uuid,
      {
        revision: source.sample.revision,
        status: "approved",
        annotations: draft,
      },
    );
    setSource({ ...source, sample });
    setNotice(`Reviewed labels saved · revision ${sample.revision}`);
  }
  async function run() {
    if (!source || !action) return;
    let image: Blob;
    if (source.blob) image = source.blob;
    else {
      const response = await fetch(source.url);
      if (!response.ok) throw new Error("Could not load source pixels.");
      image = await response.blob();
    }
    const value = await runImageModelTask(
      client,
      resolvedModel,
      action,
      image,
      prompt,
    );
    setResult({ action, value });
  }
  return (
    <main className="studio">
      <div className="studio-heading">
        <div>
          <span className="studio-kicker">15 · CAPTURE & ANNOTATION</span>
          <h1>Turn pixels into reviewed evidence</h1>
          <p>
            Capture a frame, draw regions, or review a model's canonical output.
          </p>
        </div>
        <span className="tag">Reusable @cyberwave/react components</span>
      </div>
      {error && (
        <p role="alert" className="cw-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="status-line">
          {notice}
        </p>
      )}
      <div className="workbench-grid">
        <aside className="panel">
          <h2>Choose an image</h2>
          <div className="fields">
            <label className="span-2">
              Local photo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 20 * 1024 * 1024) {
                      setError("Choose an image up to 20 MB.");
                      return;
                    }
                    choose({
                      blob: file,
                      url: URL.createObjectURL(file),
                      name: file.name,
                    });
                  }
                  e.target.value = "";
                }}
              />
            </label>
            <label className="span-2">
              Dataset UUID
              <input
                disabled={busy}
                value={dataset}
                onChange={(e) => setDataset(e.target.value)}
                placeholder="Load an existing sample"
              />
            </label>
          </div>
          <div className="toolbar">
            <button
              className="cw-button"
              disabled={busy || !dataset.trim()}
              onClick={() => perform(loadSample)}
            >
              Load first sample
            </button>
          </div>
          <ImageCapture
            disabled={busy}
            onCapture={(frame) =>
              choose({
                blob: frame.blob,
                url: URL.createObjectURL(frame.blob),
                name: "Captured frame",
                capture: {
                  mediaTime: frame.mediaTime,
                  capturedAt: frame.capturedAt,
                },
              })
            }
          />
          <p className="muted compact">
            Local photos and camera frames stay in this browser until you
            explicitly run a model or upload through your application. The
            capture utility also accepts a video element from recording playback
            or WebRTC.
          </p>
        </aside>
        <section className="panel">
          <h2>{source?.name || "Your image and regions"}</h2>
          {source ? (
            <>
              <ImageAnnotationEditor
                key={source.url}
                src={source.url}
                value={draft}
                onChange={setDraft}
                onValidityChange={setValid}
                readOnly={busy}
              />
              <div className="toolbar">
                <button
                  className="cw-button"
                  disabled={
                    busy || !valid || draft.some((a) => !a.label.trim())
                  }
                  onClick={() =>
                    downloadJson("image-annotations.json", {
                      coordinate_space: "normalized-image-xy",
                      annotations: draft,
                      source: source.sample
                        ? {
                            attachment_uuid: source.sample.attachment_uuid,
                            sha256: source.sample.source_sha256,
                            revision: source.sample.revision,
                          }
                        : { name: source.name, capture: source.capture },
                    })
                  }
                >
                  Export annotations
                </button>
                {source.sample && (
                  <button
                    className="cw-button cw-primary"
                    disabled={
                      busy || !valid || draft.some((a) => !a.label.trim())
                    }
                    onClick={() => perform(approve)}
                  >
                    Approve reviewed labels
                  </button>
                )}
              </div>
              <p className="muted compact">
                {source.sample
                  ? `Stored review: ${source.sample.review_status} · revision ${source.sample.revision}. Saving checks this revision to prevent lost edits.`
                  : "Upload the original photo as an Attachment before appending it to a dataset. The editor returns normalized boxes/polygons; it does not own storage or approval."}
              </p>
            </>
          ) : (
            <p className="muted">
              Open a photo, load a dataset sample, or start your camera.
            </p>
          )}
        </section>
      </div>
      <section className="panel section-gap">
        <h2>Assist with a Cyberwave model</h2>
        <p className="muted">
          Available tasks come from the backend catalog and the selected model.
          Provider-specific parsing stays in Cyberwave's ML adapters. Running a
          model sends this image to the configured backend and may use credits.
        </p>
        <div className="fields">
          <label>
            Model UUID
            <input
              disabled={busy}
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                setActions([]);
                setResolvedModel("");
                setResult(undefined);
              }}
            />
          </label>
          <label>
            Target / prompt
            <input
              disabled={busy}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
        </div>
        <div className="toolbar cw-annotation-toolbar">
          <button
            className="cw-button"
            disabled={busy || !model.trim()}
            onClick={() =>
              perform(async () => {
                const loaded = await loadImageModelTasks(client, model.trim());
                setActions(loaded.actions);
                setResolvedModel(model.trim());
                setActionId(loaded.actions[0]?.id || "");
                setNotice(
                  loaded.actions.length
                    ? `${loaded.actions.length} image tasks available.`
                    : "No supported image annotation contract advertised by this model/backend.",
                );
              })
            }
          >
            Load model tasks
          </button>
          <label>
            Image task
            <select
              disabled={busy}
              value={actionId}
              onChange={(e) => setActionId(e.target.value)}
            >
              <option value="">Select a backend task</option>
              {actions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="cw-button cw-primary"
            disabled={busy || !action || !source}
            onClick={() => perform(run)}
          >
            Run selected task
          </button>
        </div>
        {source && result && (
          <>
            <ModelResultOverlay
              src={source.url}
              action={result.action}
              result={result.value}
            />
            <div className="toolbar">
              <button
                className="cw-button"
                onClick={() =>
                  downloadJson("canonical-model-result.json", result)
                }
              >
                Export canonical result
              </button>
              {result.action.image_annotation?.kind === "boxes" && (
                <button
                  className="cw-button"
                  onClick={() =>
                    setDraft(modelBoxProposals(result.action, result.value))
                  }
                >
                  Replace draft with box proposals
                </button>
              )}
            </div>
            <p className="note">
              Model output is a proposal. Segmentation masks stay masks; draw
              and review a polygon before saving a polygon training label. No
              automatic mask-to-box conversion or approval.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
createRoot(document.getElementById("app")!).render(
  <ConnectedWorkbench>
    {(client) => <AnnotationWorkbench client={client} />}
  </ConnectedWorkbench>,
);
