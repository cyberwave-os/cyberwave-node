"use client";
import { useMemo, useState, type ReactNode } from "react";
import type { EvidenceCollection, CyberwaveClient } from "cyberwave";
import { useCyberwave } from "./index.js";
import { useResource, useResourceKey } from "./resource.js";
export type EvidenceRecord = EvidenceCollection["records"][number];
type CollectionSummary = Awaited<
  ReturnType<CyberwaveClient["evidence"]["list"]>
>[number];
export function EvidenceCollectionBrowser(props: {
  environmentId: string;
  selectedId?: string;
  onSelect: (collection: CollectionSummary) => void;
}) {
  return (
    <Collections
      key={useResourceKey(useCyberwave(), props.environmentId)}
      {...props}
    />
  );
}
function Collections({
  environmentId,
  selectedId,
  onSelect,
}: Parameters<typeof EvidenceCollectionBrowser>[0]) {
  const client = useCyberwave(),
    [page, setPage] = useState(0);
  const state = useResource(
    useMemo(
      () => (signal: AbortSignal) =>
        client.evidence.list(
          environmentId,
          { limit: 10, offset: page * 10 },
          { signal },
        ),
      [client, environmentId, page],
    ),
  );
  return (
    <section className="cw-browser" aria-label="Evidence collections">
      <h3>Evidence collections</h3>
      {state.loading && <p role="status">Loading collections…</p>}
      {state.error && (
        <p role="alert" className="cw-error">
          {state.error.message}
        </p>
      )}
      <div className="cw-resource-list">
        {state.data?.map((c) => (
          <button
            type="button"
            key={c.uuid}
            className={`cw-resource ${selectedId === c.uuid ? "cw-selected" : ""}`}
            aria-pressed={selectedId === c.uuid}
            onClick={() => onSelect(c)}
          >
            <span>
              <strong>{c.name}</strong>
              <small>
                {c.asset_reference} ·{" "}
                {c.coverage == null
                  ? "Coverage unknown"
                  : `${Math.round(c.coverage * 100)}% coverage`}
              </small>
            </span>
          </button>
        ))}
      </div>
      {state.data?.length === 0 && <p>No stored collections in this page.</p>}
      <div className="cw-pagination">
        <button
          type="button"
          className="cw-button"
          disabled={state.loading || !page}
          onClick={() => setPage(page - 1)}
        >
          Previous collections
        </button>
        <span>Page {page + 1}</span>
        <button
          type="button"
          className="cw-button"
          disabled={state.loading || !state.data || state.data.length < 10}
          onClick={() => setPage(page + 1)}
        >
          Next collections
        </button>
      </div>
    </section>
  );
}
export function useEvidenceCollection(
  environmentId: string,
  collectionId?: string,
) {
  const client = useCyberwave();
  return useResource(
    useMemo(
      () => (signal: AbortSignal) =>
        collectionId
          ? client.evidence.get(environmentId, collectionId, { signal })
          : Promise.resolve(undefined),
      [client, environmentId, collectionId],
    ),
  );
}
export function EvidenceRecordList({
  collection,
  selectedId,
  onSelect,
}: {
  collection: EvidenceCollection;
  selectedId?: string;
  onSelect: (item: EvidenceRecord) => void;
}) {
  return (
    <section className="cw-browser" aria-label="Evidence records">
      <h3>Records · {collection.records.length}</h3>
      <p>
        {collection.coverage == null
          ? "Coverage unknown"
          : `${Math.round(collection.coverage * 100)}% coverage`}{" "}
        · {collection.limitations || "No limitations supplied"}
      </p>
      <div className="cw-resource-list">
        {collection.records.map((o) => (
          <button
            type="button"
            key={o.uuid}
            className={`cw-resource ${o.uuid === selectedId ? "cw-selected" : ""}`}
            aria-pressed={o.uuid === selectedId}
            onClick={() => onSelect(o)}
          >
            <span>
              <strong>{o.source.kind}</strong>
              <small>
                {o.source.chainage_m == null
                  ? "Position unresolved"
                  : `Chainage ${o.source.chainage_m} m`}{" "}
                · {o.source.observed ? "Observed" : "Not observed"}
              </small>
            </span>
          </button>
        ))}
      </div>
      {!collection.records.length && <p>No records supplied.</p>}
    </section>
  );
}
export function EvidenceRecordDetails({
  record,
  children,
}: {
  record: EvidenceRecord;
  children?: ReactNode;
}) {
  const source = record.source,
    latest = [...record.reviews].sort(
      (a, b) => b.revision - a.revision,
    )[0];
  return (
    <section className="cw-browser" aria-label="Evidence record details">
      <h3>{source.kind}</h3>
      <p>
        {source.observed
          ? "Finding observed"
          : source.target_covered
            ? "Finding absent in covered target"
            : "Not observed · coverage unconfirmed"}
      </p>
      <dl className="cw-detail-list">
        <dt>Technical state</dt>
        <dd>{latest?.assessment.technical_state ?? "Not reviewed"}</dd>
        <dt>Review</dt>
        <dd>
          {latest
            ? `${latest.assessment.decision} · revision ${latest.revision}`
            : "Pending"}
        </dd>
        <dt>Severity</dt>
        <dd>{latest?.assessment.severity ?? "Not assessed"}</dd>
        <dt>Priority</dt>
        <dd>{latest?.assessment.priority ?? "Not assigned"}</dd>
        <dt>Evidence reference</dt>
        <dd>{source.evidence?.reference ?? "Unavailable"}</dd>
      </dl>
      {source.measurement && (
        <p>
          Measurement: {source.measurement.value} {source.measurement.unit}
          {source.measurement.uncertainty != null
            ? ` ± ${source.measurement.uncertainty}`
            : " · uncertainty not supplied"}{" "}
          · {source.measurement.method}
        </p>
      )}
      {source.limitation && <p className="cw-note">{source.limitation}</p>}
      {source.model_version && (
        <p>
          Model: {source.model_version} · run{" "}
          {source.model_run_reference ?? "unknown"}
        </p>
      )}
      {children}
      <details>
        <summary>Review history · {record.reviews.length}</summary>
        {[...record.reviews]
          .sort((a, b) => b.revision - a.revision)
          .map((r) => (
            <article key={r.uuid}>
              <strong>
                Revision {r.revision} · {r.assessment.decision}
              </strong>
              <p>{r.reason}</p>
              <small>
                {r.created_at} · {r.created_by_uuid ?? "Reviewer unavailable"}
              </small>
            </article>
          ))}
      </details>
    </section>
  );
}
