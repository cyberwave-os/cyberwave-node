import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  type CyberwaveClient,
  type MLModel,
  type DatasetSample,
  type SampleAnnotation,
  type StructuredImageAction,
} from "cyberwave";
import {
  ImageAnnotationEditor,
  ImageCapture,
  ImageModelTaskControls,
  imageModelUnavailableReason,
  ModelResultOverlay,
  loadImageModelTasks,
  runImageModelTask,
  waitForImageModelTask,
  modelBoxProposals,
  type ImageModelResult,
} from "@cyberwave/react/annotation";
import { DatasetSampleBrowser, ModelBrowser } from "@cyberwave/react";
import { ConnectedWorkbench, downloadJson } from "./workbench-connection.tsx";
import { mediaUrl } from "./connection.ts";
import { CollectionPicker } from "./collection-picker.tsx";
import { sameAnnotations } from "./annotation-draft.ts";
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
  const operation = useRef<AbortController | null>(null);
  const [job, setJob] = useState<{ uuid: string; status: string }>();
  const [monitoring, setMonitoring] = useState(false);
  const [source, setSource] = useState<Source>(),
    [draft, setDraft] = useState<SampleAnnotation[]>([]);
  const [collection, setCollection] = useState(() => ({
    uuid: new URLSearchParams(location.search).get("dataset") || "",
    name: "",
  }));
  const [sampleRefresh, setSampleRefresh] = useState(0);
  const dirty = !sameAnnotations(draft, source?.sample?.annotations || []);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [valid, setValid] = useState(false);
  const [model, setModel] = useState(""),
    [resolvedModel, setResolvedModel] = useState<MLModel>(),
    [actions, setActions] = useState<StructuredImageAction[]>([]),
    [actionId, setActionId] = useState(""),
    [prompt, setPrompt] = useState(""),
    [result, setResult] = useState<{
      action: StructuredImageAction;
      value: ImageModelResult;
    }>();
  const unfinished = job && !["completed", "failed"].includes(job.status);
  const sourceLocked = busy || dirty || !!unfinished;
  const [browseModels, setBrowseModels] = useState(true);
  const action = actions.find((a) => a.id === actionId);
  useEffect(
    () => () => {
      operation.current?.abort();
      operation.current = null;
    },
    [client],
  );
  useEffect(
    () => () => {
      if (source?.url.startsWith("blob:")) URL.revokeObjectURL(source.url);
    },
    [source?.url],
  );
  function choose(next: Source) {
    if (source?.url !== next.url) setValid(false);
    setSource(next);
    setDraft(next.sample?.annotations || []);
    setResult(undefined);
    setJob(undefined);
    setNotice("");
    setError("");
  }
  async function perform(task: (signal: AbortSignal) => Promise<void>) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task(controller.signal);
    } catch (e) {
      if (operation.current !== controller) return;
      if (controller.signal.aborted)
        setNotice(
          "Monitoring stopped. The server job continues; resume using the same execution.",
        );
      else setError((e as Error).message);
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setBusy(false);
        setMonitoring(false);
      }
    }
  }
  function selectSample(sample: DatasetSample) {
    if (sourceLocked) return;
    if (sample.source_changed || !sample.file_url) {
      setError(
        `Sample ${sample.uuid}: source changed or media is unavailable. Reload or choose another sample.`,
      );
      return;
    }
    choose({
      url: mediaUrl(sample.file_url),
      name: `Sample ${sample.uuid.slice(0, 8)}`,
      sample,
      dataset: collection.uuid,
    });
  }
  async function approve(signal: AbortSignal) {
    if (!source?.sample || !source.dataset) return;
    const sample = await client.datasets.reviewSample(
      source.dataset,
      source.sample.uuid,
      {
        revision: source.sample.revision,
        status: "approved",
        annotations: draft,
      },
      { signal },
    );
    if (signal.aborted) return;
    setSource({ ...source, sample });
    setDraft(sample.annotations);
    setSampleRefresh((value) => value + 1);
    setNotice(`Reviewed labels saved · revision ${sample.revision}`);
  }
  async function selectModel(uuid: string, signal: AbortSignal) {
    // Clear the previous model before loading another contract, including on failure.
    setResolvedModel(undefined);
    setActions([]);
    setActionId("");
    setPrompt("");
    setResult(undefined);
    setJob(undefined);
    const loaded = await loadImageModelTasks(client, uuid, signal);
    if (signal.aborted) return;
    setResolvedModel(loaded.model);
    setActions(loaded.actions);
    setActionId(loaded.actions[0]?.id || "");
    setBrowseModels(false);
  }
  async function run(signal: AbortSignal, resume = false) {
    if (
      !source ||
      !action ||
      !resolvedModel ||
      imageModelUnavailableReason(resolvedModel)
    )
      return;
    setMonitoring(true);
    setResult(undefined);
    const options = {
      signal,
      onProgress: (execution: { uuid: string; status: string }) =>
        setJob({ uuid: execution.uuid, status: execution.status }),
    };
    if (resume && job) {
      const value = await waitForImageModelTask(
        client,
        job.uuid,
        action,
        options,
      );
      setResult({ action, value });
      return;
    }
    setJob(undefined);
    let image: Blob;
    if (source.blob) image = source.blob;
    else {
      const response = await fetch(source.url, { signal });
      if (!response.ok) throw new Error("Could not load source pixels.");
      image = await response.blob();
    }
    const value = await runImageModelTask(
      client,
      resolvedModel.uuid,
      action,
      image,
      prompt,
      signal,
      { ...options, onQueued: (uuid) => setJob({ uuid, status: "queued" }) },
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
      {dirty && (
        <div role="status" className="panel section-gap">
          <strong>Unsaved label edits</strong>
          <p>
            Save this sample or export your labels before discarding. Image
            selection and sample browsing are locked while edits are pending.
          </p>
          <button
            className="cw-button"
            disabled={busy}
            onClick={() => setDraft(source?.sample?.annotations || [])}
          >
            Discard label edits
          </button>
        </div>
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
                disabled={sourceLocked}
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
          </div>
          <CollectionPicker
            value={collection}
            disabled={sourceLocked}
            onChange={(value) => {
              setCollection({ uuid: value.uuid, name: value.name || "" });
              setSource(undefined);
              setDraft([]);
              setResult(undefined);
              setJob(undefined);
              setNotice("");
              setError("");
            }}
          />
          {collection.uuid && (
            <DatasetSampleBrowser
              datasetId={collection.uuid}
              selectedId={
                source?.dataset === collection.uuid
                  ? source.sample?.uuid
                  : undefined
              }
              onSelect={selectSample}
              resolveResource={mediaUrl}
              disabled={sourceLocked}
              refreshKey={sampleRefresh}
            />
          )}
          <ImageCapture
            disabled={sourceLocked}
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
        {resolvedModel && (
          <button
            type="button"
            className="cw-button"
            disabled={busy || !!unfinished}
            onClick={() => setBrowseModels(!browseModels)}
          >
            {browseModels ? "Hide models" : "Change model"}
          </button>
        )}
        {browseModels && (
          <>
            <ModelBrowser
              selectedId={resolvedModel?.uuid}
              disabled={busy || !!unfinished}
              onSelect={(item) =>
                perform((signal) => selectModel(item.uuid, signal))
              }
            />
            <details>
              <summary>Open a model by UUID</summary>
              <label className="cw-catalog-filter">
                Model UUID
                <input
                  disabled={busy || !!unfinished}
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="cw-button"
                disabled={busy || !!unfinished || !model.trim()}
                onClick={() =>
                  perform((signal) => selectModel(model.trim(), signal))
                }
              >
                Load model tasks
              </button>
            </details>
          </>
        )}
        {resolvedModel && (
          <ImageModelTaskControls
            model={resolvedModel}
            actions={actions}
            actionId={actionId}
            onActionChange={(id) => {
              setActionId(id);
              setPrompt("");
              setJob(undefined);
              setResult(undefined);
            }}
            prompt={prompt}
            onPromptChange={setPrompt}
            imageName={source?.name}
            disabled={busy || !!unfinished}
          />
        )}
        <div className="toolbar">
          <button
            type="button"
            className="cw-button cw-primary"
            disabled={
              busy ||
              !action ||
              !source ||
              !valid ||
              !!unfinished ||
              !resolvedModel ||
              !!imageModelUnavailableReason(resolvedModel)
            }
            onClick={() => perform(run)}
          >
            Run selected task
          </button>
        </div>
        {job && (
          <div className="panel" aria-label="Model execution">
            <p role="status">Model execution · {job.status}</p>
            <p>
              <code>{job.uuid}</code>
            </p>
            <div className="toolbar">
              {monitoring && unfinished && (
                <button
                  className="cw-button"
                  onClick={() => operation.current?.abort()}
                >
                  Stop monitoring
                </button>
              )}
              {!busy && job.status !== "failed" && (
                <button
                  className="cw-button"
                  onClick={() => perform((signal) => run(signal, true))}
                >
                  Resume monitoring
                </button>
              )}
            </div>
            <p className="note">
              Stopping monitoring leaves the server job running. Resuming reads
              this execution without submitting another task. Keep this image
              and task selected while reviewing its result.
            </p>
          </div>
        )}
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
                  disabled={busy}
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
