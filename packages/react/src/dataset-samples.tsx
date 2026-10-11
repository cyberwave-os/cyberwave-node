"use client";
import { useMemo, useState } from "react";
import type { DatasetSample } from "cyberwave";
import { useCyberwave } from "./index.js";
import { EvidencePreview } from "./activity-results.js";
import { useResource, useResourceKey } from "./resource.js";

/** Controlled selection over the existing sample cursor API; never approves or uploads. */
export function DatasetSampleBrowser(props: {
  datasetId: string;
  selectedId?: string;
  onSelect: (sample: DatasetSample) => void;
  resolveResource?: (url: string) => string;
  /** Lock browsing while the host saves or holds unsaved review edits. */
  disabled?: boolean;
  /** Increment after a host mutation to reload the current page. */
  refreshKey?: number;
}) {
  const key = useResourceKey(useCyberwave(), props.datasetId);
  return props.datasetId.trim() ? (
    <Samples key={key} {...props} />
  ) : (
    <p role="status">Choose a dataset to browse its samples.</p>
  );
}

function Samples({
  datasetId,
  selectedId,
  onSelect,
  resolveResource,
  disabled = false,
  refreshKey = 0,
}: Parameters<typeof DatasetSampleBrowser>[0]) {
  const client = useCyberwave();
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const after = cursors[cursors.length - 1];
  const state = useResource(
    useMemo(
      () => (signal: AbortSignal) =>
        client.datasets.samples(
          datasetId,
          { limit: 12, after, approved_only: approvedOnly },
          { signal },
        ),
      [client, datasetId, after, approvedOnly, refresh, refreshKey],
    ),
  );
  const next = state.data?.next_after;
  // A broken/repeated cursor must not cause a loop or silently restart at page 1.
  const canAdvance =
    typeof next === "number" &&
    Number.isSafeInteger(next) &&
    next >= 0 &&
    (after === undefined || next > after);
  const invalidCursor = next != null && !canAdvance;
  return (
    <section
      className="cw-browser cw-sample-browser"
      aria-label="Dataset samples"
    >
      <div className="cw-sensor-heading">
        <h3>Dataset samples</h3>
        <button
          type="button"
          className="cw-button"
          disabled={disabled || state.loading}
          onClick={() => setRefresh(refresh + 1)}
        >
          Refresh samples
        </button>
      </div>
      <label className="cw-sample-filter">
        <input
          type="checkbox"
          checked={approvedOnly}
          disabled={disabled || state.loading}
          onChange={(event) => {
            setApprovedOnly(event.target.checked);
            setCursors([undefined]);
          }}
        />
        Approved samples only
      </label>
      {state.loading && <p role="status">Loading dataset samples…</p>}
      {state.error && (
        <p role="alert" className="cw-error">
          {state.error.message}
        </p>
      )}
      {state.data && (
        <p className="cw-muted">
          {state.data.items.length} on this page ·{" "}
          {approvedOnly ? "Approved and source-checked" : "All review states"}
        </p>
      )}
      <div className="cw-resource-list">
        {state.data?.items.map((sample) => {
          const url =
            !sample.source_changed && sample.file_url
              ? new URL(sample.file_url, client.baseUrl).href
              : undefined;
          return (
            <button
              type="button"
              key={sample.uuid}
              className={`cw-resource cw-sample-row ${selectedId === sample.uuid ? "cw-selected" : ""}`}
              aria-pressed={selectedId === sample.uuid}
              disabled={disabled}
              onClick={() => onSelect(sample)}
            >
              <EvidencePreview
                src={url && (resolveResource ? resolveResource(url) : url)}
                caption="Sample preview"
                unavailableReason={
                  sample.source_changed ? "Source changed" : "No preview"
                }
              />
              <span>
                <strong>
                  {sample.annotations
                    .map((annotation) => annotation.label)
                    .join(" · ") || "Unlabelled sample"}
                </strong>
                <small>
                  {sample.review_status} · revision {sample.revision} ·{" "}
                  {sample.annotations.length}{" "}
                  {sample.annotations.length === 1 ? "region" : "regions"}
                </small>
                <small className="cw-sample-id">{sample.uuid}</small>
                {sample.source_changed && (
                  <small className="cw-error">
                    Source changed · excluded from approved exports
                  </small>
                )}
                {!sample.source_changed && !sample.file_url && (
                  <small>Media unavailable</small>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {state.data?.items.length === 0 && (
        <p role="status">
          No visible samples on this page
          {approvedOnly ? " matching the approved filter" : ""}.
        </p>
      )}
      {invalidCursor && (
        <p role="alert" className="cw-error">
          The server returned an invalid sample cursor. Refresh this page before
          continuing.
        </p>
      )}
      <div className="cw-pagination">
        <button
          type="button"
          className="cw-button"
          disabled={disabled || state.loading || cursors.length === 1}
          onClick={() => setCursors(cursors.slice(0, -1))}
        >
          Previous samples
        </button>
        <span>Page {cursors.length}</span>
        <button
          type="button"
          className="cw-button"
          disabled={disabled || state.loading || !canAdvance}
          onClick={() => {
            if (canAdvance) setCursors([...cursors, next]);
          }}
        >
          Next samples
        </button>
      </div>
    </section>
  );
}
