"use client";
import { useState, type ReactNode } from "react";

/** A view projection of workflow outputs or an external system, never a persisted activity model. */
export type ActivityResult = {
  id: string;
  title: string;
  outcome: "normal" | "attention" | "unavailable";
  value?: number | null;
  unit?: string;
  expectedRange?: { min: number; max: number; unit: string };
  capturedAt?: string;
  method?: string;
  limitation?: string;
  sourceReference?: string;
};
export function ActivityResults({
  results,
  selectedId,
  onSelect,
}: {
  results: ActivityResult[];
  selectedId?: string;
  onSelect: (result: ActivityResult) => void;
}) {
  const [filter, setFilter] = useState("all");
  const visible = results.filter(
    (r) => filter === "all" || r.outcome === filter,
  );
  return (
    <section className="cw-browser" aria-label="Activity results">
      <div className="cw-sensor-heading">
        <h3>Activity results</h3>
        <label>
          Result filter{" "}
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All results</option>
            <option value="attention">Needs attention</option>
            <option value="normal">Normal</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </label>
      </div>
      <p>
        {results.length} results ·{" "}
        {results.filter((r) => r.outcome === "attention").length} need attention
        · {results.filter((r) => r.outcome === "unavailable").length}{" "}
        unavailable
      </p>
      <div className="cw-resource-list">
        {visible.map((result) => (
          <button
            type="button"
            key={result.id}
            aria-pressed={result.id === selectedId}
            className={`cw-resource ${result.id === selectedId ? "cw-selected" : ""}`}
            onClick={() => onSelect(result)}
          >
            <span>
              <strong>{result.title}</strong>
              <small>
                {result.outcome} · {result.capturedAt ?? "Time not supplied"}
              </small>
            </span>
          </button>
        ))}
      </div>
      {!visible.length && <p role="status">No matching results.</p>}
    </section>
  );
}
export function MeasurementCard({
  result,
  children,
}: {
  result: ActivityResult;
  children?: ReactNode;
}) {
  const present =
    result.outcome !== "unavailable" &&
    typeof result.value === "number" &&
    Number.isFinite(result.value);
  return (
    <section className="cw-browser cw-measurement" aria-label="Result details">
      <span className={`cw-outcome cw-outcome-${result.outcome}`}>
        {result.outcome}
      </span>
      <h3>{result.title}</h3>
      <p className="cw-measurement-value">
        {present
          ? `${result.value} ${result.unit ?? "unit not supplied"}`
          : "No measured value"}
      </p>
      {result.expectedRange && (
        <p>
          Expected range: {result.expectedRange.min}–{result.expectedRange.max}{" "}
          {result.expectedRange.unit}
        </p>
      )}
      <p>{result.method ?? "Measurement method not supplied"}</p>
      {result.limitation && <p className="cw-note">{result.limitation}</p>}
      {result.sourceReference && (
        <p className="cw-muted">Source: {result.sourceReference}</p>
      )}
      {children}
    </section>
  );
}
/** A host resolves authorized evidence URLs. Opaque backend references are never treated as URLs. */
export function EvidencePreview(props: {
  src?: string;
  kind?: "image" | "video" | "audio";
  caption: string;
  unavailableReason?: string;
}) {
  return <Evidence key={`${props.kind}:${props.src}`} {...props} />;
}
function Evidence({
  src,
  kind = "image",
  caption,
  unavailableReason,
}: Parameters<typeof EvidencePreview>[0]) {
  const [failed, setFailed] = useState(false);
  // Relative application resources and explicit HTTP(S)/blob URLs only.
  const safe =
    src &&
    (/^https?:\/\//i.test(src) ||
      /^blob:https?:\/\//i.test(src) ||
      /^\/(?!\/)/.test(src));
  return (
    <figure className="cw-evidence">
      {!safe || failed ? (
        <div className="cw-evidence-empty" role="status">
          {failed
            ? "Evidence could not be loaded. Refresh its authorized URL."
            : (unavailableReason ?? "Evidence is unavailable.")}
        </div>
      ) : kind === "image" ? (
        <img
          src={src}
          alt={caption}
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
        />
      ) : kind === "audio" ? (
        <audio
          src={src}
          controls
          preload="none"
          onError={() => setFailed(true)}
        />
      ) : (
        <video
          src={src}
          controls
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
        />
      )}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
