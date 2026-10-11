"use client";
import { useMemo, useState, type ReactNode } from "react";
import type { InspectionCampaign, CyberwaveClient } from "cyberwave";
import { useCyberwave } from "./index.js";
import { useResource, useResourceKey } from "./resource.js";
export type InspectionObservation = InspectionCampaign["observations"][number];
type CampaignSummary = Awaited<
  ReturnType<CyberwaveClient["inspections"]["list"]>
>[number];
export function InspectionCampaignBrowser(props: {
  environmentId: string;
  selectedId?: string;
  onSelect: (campaign: CampaignSummary) => void;
}) {
  return (
    <Campaigns
      key={useResourceKey(useCyberwave(), props.environmentId)}
      {...props}
    />
  );
}
function Campaigns({
  environmentId,
  selectedId,
  onSelect,
}: Parameters<typeof InspectionCampaignBrowser>[0]) {
  const client = useCyberwave(),
    [page, setPage] = useState(0);
  const state = useResource(
    useMemo(
      () => (signal: AbortSignal) =>
        client.inspections.list(
          environmentId,
          { limit: 10, offset: page * 10 },
          { signal },
        ),
      [client, environmentId, page],
    ),
  );
  return (
    <section className="cw-browser" aria-label="Inspection campaigns">
      <h3>Inspection campaigns</h3>
      {state.loading && <p role="status">Loading campaigns…</p>}
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
      {state.data?.length === 0 && <p>No stored campaigns in this page.</p>}
      <div className="cw-pagination">
        <button
          type="button"
          className="cw-button"
          disabled={state.loading || !page}
          onClick={() => setPage(page - 1)}
        >
          Previous campaigns
        </button>
        <span>Page {page + 1}</span>
        <button
          type="button"
          className="cw-button"
          disabled={state.loading || !state.data || state.data.length < 10}
          onClick={() => setPage(page + 1)}
        >
          Next campaigns
        </button>
      </div>
    </section>
  );
}
export function useInspectionCampaign(
  environmentId: string,
  campaignId?: string,
) {
  const client = useCyberwave();
  return useResource(
    useMemo(
      () => (signal: AbortSignal) =>
        campaignId
          ? client.inspections.get(environmentId, campaignId, { signal })
          : Promise.resolve(undefined),
      [client, environmentId, campaignId],
    ),
  );
}
export function InspectionObservationList({
  campaign,
  selectedId,
  onSelect,
}: {
  campaign: InspectionCampaign;
  selectedId?: string;
  onSelect: (item: InspectionObservation) => void;
}) {
  return (
    <section className="cw-browser" aria-label="Inspection observations">
      <h3>Observations · {campaign.observations.length}</h3>
      <p>
        {campaign.coverage == null
          ? "Coverage unknown"
          : `${Math.round(campaign.coverage * 100)}% coverage`}{" "}
        · {campaign.limitations || "No limitations supplied"}
      </p>
      <div className="cw-resource-list">
        {campaign.observations.map((o) => (
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
      {!campaign.observations.length && <p>No observations supplied.</p>}
    </section>
  );
}
export function InspectionObservationDetails({
  observation,
  children,
}: {
  observation: InspectionObservation;
  children?: ReactNode;
}) {
  const source = observation.source,
    latest = [...observation.reviews].sort(
      (a, b) => b.revision - a.revision,
    )[0];
  return (
    <section className="cw-browser" aria-label="Observation details">
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
        <dt>Maintenance priority</dt>
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
        <summary>Review history · {observation.reviews.length}</summary>
        {[...observation.reviews]
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
