import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  type CyberwaveClient,
  type HumanAction,
  type DatasetSample,
} from "cyberwave";
import { DatasetSampleBrowser } from "@cyberwave/react";
import { ConnectedWorkbench } from "./workbench-connection.tsx";
import { CollectionPicker } from "./collection-picker.tsx";
import { mediaUrl } from "./connection.ts";
import "@cyberwave/react/styles.css";
import "./workbench.css";
import "./human-evidence.css";

function EvidenceImage({
  url,
  annotations = [],
}: {
  url: string;
  annotations?: DatasetSample["annotations"];
}) {
  return (
    <div className="human-evidence-image">
      <img src={mediaUrl(url)} alt="Inspection evidence" />
      {annotations.length > 0 && (
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          aria-label="Reviewed object regions"
          role="img"
        >
          {annotations.map(
            ({ bbox: [left, top, right, bottom], polygon, label }, i) =>
              polygon ? (
                <polygon
                  key={i}
                  points={polygon.map(([x, y]) => `${x},${y}`).join(" ")}
                  vectorEffect="non-scaling-stroke"
                  fill="none"
                  stroke="#71e4d0"
                  strokeWidth="2"
                >
                  <title>{label}</title>
                </polygon>
              ) : (
                <rect
                  key={i}
                  x={left}
                  y={top}
                  width={right - left}
                  height={bottom - top}
                  vectorEffect="non-scaling-stroke"
                >
                  <title>{label}</title>
                </rect>
              ),
          )}
        </svg>
      )}
    </div>
  );
}

function HumanEvidence({ client }: { client: CyberwaveClient }) {
  const [actions, setActions] = useState<HumanAction[]>([]);
  const [collection, setCollection] = useState({ uuid: "", name: "" });
  const [sample, setSample] = useState<DatasetSample>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<HumanAction>();

  async function loadActions(signal?: AbortSignal) {
    const actions = await client.humanActions.list({}, { signal });
    if (signal?.aborted) return;
    setActions(actions);
    setSelected((current) =>
      actions.find((action) => action.uuid === current?.uuid),
    );
  }
  useEffect(() => {
    const controller = new AbortController();
    loadActions(controller.signal).catch((e) => {
      if (!controller.signal.aborted) setError(e.message);
    });
    return () => controller.abort();
  }, [client]);
  async function perform(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function respond(decision: "approved" | "rejected" | "completed") {
    if (!selected) return;
    setSelected(
      await client.humanActions.respond(selected.uuid, { decision, note }),
    );
    await loadActions();
  }
  return (
    <main className="studio human-evidence">
      <div className="studio-heading">
        <div>
          <span className="studio-kicker">14 · HUMAN REVIEW & TRAINING</span>
          <h1>From inspection to reviewed evidence</h1>
          <p>
            A person responds. The workflow resumes. Reviewed photos become
            training data.
          </p>
        </div>
        <span className="tag">Existing workflow & dataset APIs</span>
      </div>
      <div className="plan-steps">
        <span>01 · Collect a photo</span>
        <span>02 · Confirm the action</span>
        <span>03 · Review dataset labels</span>
        <span>04 · Export for training</span>
      </div>
      <p className="note">
        This example requires the preview backend. Connect to your local API in
        the header. Collect photos in the platform's Your actions inbox; browse
        the collection below and open it in the annotation workbench to review
        labels. Changes through this example gateway are local only.
      </p>
      {error && (
        <p role="alert" className="cw-error">
          {error}
        </p>
      )}
      <div className="evidence-layout section-gap">
        <section className="panel">
          <h2>Your workflow actions</h2>
          <div className="toolbar">
            <button
              className="cw-button"
              disabled={busy}
              onClick={() => perform(() => loadActions())}
            >
              Refresh actions
            </button>
            <span className="muted compact">
              {actions.length} returned · up to 50
            </span>
          </div>
          <div className="cw-resource-list">
            {actions.map((action) => (
              <button
                className={`cw-resource ${selected?.uuid === action.uuid ? "cw-selected" : ""}`}
                key={action.uuid}
                onClick={() => {
                  setSelected(action);
                  setNote("");
                }}
              >
                <span>
                  <strong>{action.title}</strong>
                  <small>{action.workflow_name}</small>
                </span>
                <span className="tag">{action.status}</span>
              </button>
            ))}
          </div>
          {!actions.length && (
            <p className="muted">
              No assigned actions returned. Run a workflow with a Human Action
              node as the connected person.
            </p>
          )}
          {selected && (
            <article className="section-gap">
              <h3>{selected.title}</h3>
              <p>{selected.instructions}</p>
              {selected.file_url && <EvidenceImage url={selected.file_url} />}
              {selected.source_changed && (
                <p role="alert" className="note">
                  The source changed or is no longer accessible. Approval is
                  blocked.
                </p>
              )}
              <p className="muted">
                {selected.workflow_name} · {selected.status}
              </p>
              {selected.response && (
                <p className="note">
                  Response recorded: {String(selected.response.decision)}
                  {selected.response.note
                    ? ` — ${String(selected.response.note)}`
                    : ""}
                  . Check the workflow execution for its final outcome.
                </p>
              )}
              {selected.status === "pending" && selected.kind !== "photo" && (
                <>
                  <div className="fields">
                    <label className="span-2">
                      Response note
                      <textarea
                        value={note}
                        maxLength={4000}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="toolbar">
                    <button
                      className="cw-button cw-primary"
                      disabled={busy || selected.source_changed}
                      onClick={() =>
                        perform(() =>
                          respond(
                            selected.kind === "decision"
                              ? "approved"
                              : "completed",
                          ),
                        )
                      }
                    >
                      {selected.kind === "decision"
                        ? "Approve and resume"
                        : "Complete and resume"}
                    </button>
                    {selected.kind === "decision" && (
                      <button
                        className="cw-button"
                        disabled={busy}
                        onClick={() => perform(() => respond("rejected"))}
                      >
                        Reject and stop
                      </button>
                    )}
                  </div>
                </>
              )}
              {selected.kind === "photo" && selected.status === "pending" && (
                <p className="note">
                  Complete this photo action through the authenticated platform
                  inbox linked by email.
                </p>
              )}
            </article>
          )}
        </section>
        <section className="panel">
          <h2>Dataset evidence</h2>
          <CollectionPicker
            value={collection}
            disabled={busy}
            onChange={(value) => {
              setCollection({ uuid: value.uuid, name: value.name || "" });
              setSample(undefined);
            }}
          />
          {collection.uuid && (
            <DatasetSampleBrowser
              datasetId={collection.uuid}
              selectedId={sample?.uuid}
              resolveResource={mediaUrl}
              onSelect={setSample}
              disabled={busy}
            />
          )}
          {sample && (
            <article
              className="section-gap"
              aria-label="Selected dataset sample"
            >
              <h3>Selected evidence</h3>
              <p className="muted compact">
                <code>{sample.uuid}</code>
              </p>
              {!sample.source_changed && sample.file_url ? (
                <EvidenceImage
                  url={sample.file_url}
                  annotations={sample.annotations}
                />
              ) : (
                <p role="status">
                  {sample.source_changed
                    ? "Source changed. This sample is excluded from approved exports."
                    : "Media is unavailable for this sample."}
                </p>
              )}
              <p>
                <span className="tag">{sample.review_status}</span> ·{" "}
                {sample.annotations.length}{" "}
                {sample.annotations.length === 1 ? "region" : "regions"} ·
                revision {sample.revision}
              </p>
              <p className="muted compact">
                {sample.annotations.map((a) => a.label).join(" · ") ||
                  "No objects labeled"}
              </p>
              <p className="muted compact">
                Source SHA-256: <code>{sample.source_sha256}</code>
              </p>
              <a
                className="studio-link"
                href={`/image-annotation.html?dataset=${encodeURIComponent(collection.uuid)}`}
              >
                Open this collection in the annotation workbench ↗
              </a>
              <p className="note">
                Choose this sample by its UUID in the workbench. The collection
                link contains no media URL or credentials.
              </p>
            </article>
          )}
        </section>
      </div>
      <section className="panel section-gap">
        <h2>Use the evidence in another workflow</h2>
        <p>
          Schedule or manually run an HTTP Request to your training worker. The
          worker exports reviewed photos, checks source hashes, and trains
          against a separate validation collection. Consent to continue a
          workflow and approval of training labels remain separate decisions.
        </p>
        <a
          className="studio-link"
          href="https://github.com/cyberwave-os/cyberwave-node/tree/codex/cyb-4234-javascript-sdk-components/examples/training"
        >
          Reviewed evidence → YOLO recipe
        </a>
      </section>
    </main>
  );
}
createRoot(document.getElementById("app")!).render(
  <ConnectedWorkbench>
    {(client) => <HumanEvidence client={client} />}
  </ConnectedWorkbench>,
);
