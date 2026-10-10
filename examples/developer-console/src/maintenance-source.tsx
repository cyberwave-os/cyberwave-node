import { useEffect, useState } from "react";
import type { CyberwaveClient, InspectionCampaign } from "cyberwave";
import { workflowError } from "@cyberwave/react";
import {
  validatedFindings,
  type FindingReference,
} from "./maintenance-domain.ts";

/** Reads one campaign at a time; no workspace-wide fan-out or invented defect endpoint. */
export function MaintenanceSource({
  client,
  environmentId,
  onSelect,
  actionLabel = "Link to maintenance proposal ↗",
}: {
  client: CyberwaveClient;
  environmentId: string;
  actionLabel?: string;
  onSelect: (finding: FindingReference) => void;
}) {
  const [rows, setRows] = useState<
    Awaited<ReturnType<CyberwaveClient["inspections"]["list"]>>
  >([]);
  const [campaignId, setCampaignId] = useState(""),
    [campaign, setCampaign] = useState<InspectionCampaign>();
  const [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    setRows([]);
    setCampaignId("");
    setError("");
    client.inspections
      .list(
        environmentId,
        { limit: 10, offset: page * 10 },
        { signal: abort.signal },
      )
      .then((items) => {
        if (!abort.signal.aborted) setRows(items);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(workflowError(e));
      });
    return () => abort.abort();
  }, [client, environmentId, page]);
  useEffect(() => {
    const abort = new AbortController();
    setCampaign(undefined);
    setLoading(false);
    if (campaignId) {
      setLoading(true);
      setError("");
      client.inspections
        .get(environmentId, campaignId, { signal: abort.signal })
        .then((value) => {
          if (!abort.signal.aborted) setCampaign(value);
        })
        .catch((e) => {
          if (!abort.signal.aborted) setError(workflowError(e));
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }
    return () => abort.abort();
  }, [client, environmentId, campaignId]);
  const findings = campaign ? validatedFindings(environmentId, campaign) : [];
  return (
    <section className="section-gap">
      <h3>Use a stored inspection finding</h3>
      <p className="compact muted">
        Choose a campaign, then link a finding whose latest review is validated.
        This is a campaign snapshot, not an asset-wide maintenance backlog.
      </p>
      <label className="maintenance-select">
        Inspection campaign
        <select
          aria-label="Inspection campaign"
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
        >
          <option value="">Choose a campaign</option>
          {rows.map((row) => (
            <option key={row.uuid} value={row.uuid}>
              {row.name}
            </option>
          ))}
        </select>
      </label>
      <div className="toolbar">
        <button
          className="cw-button"
          disabled={!page}
          onClick={() => setPage(page - 1)}
        >
          Previous campaigns
        </button>
        <span>Page {page + 1}</span>
        <button
          className="cw-button"
          disabled={rows.length < 10}
          onClick={() => setPage(page + 1)}
        >
          Next campaigns
        </button>
      </div>
      {error && (
        <p role="alert" className="cw-error">
          {error} Use the branch backend for the inspection API.
        </p>
      )}
      {loading && <p role="status">Loading observations…</p>}
      {campaign && !findings.length && (
        <p className="note">
          No validated, observed findings with evidence in this campaign. Review
          observations in the campaign workbench first.
        </p>
      )}
      <div className="cw-resource-list">
        {findings.map((finding) => (
          <button
            key={finding.observationId}
            className="cw-resource"
            onClick={() => onSelect(finding)}
          >
            <span>
              <strong>{finding.name}</strong>
              <small>
                {finding.assetReference} · {finding.priority} · review{" "}
                {finding.revision}
              </small>
              <small>{actionLabel}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
