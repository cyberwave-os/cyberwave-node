import { useState } from "react";
import type { CyberwaveClient } from "cyberwave";
import {
  EvidenceCollectionBrowser,
  useEvidenceCollection,
} from "@cyberwave/react";

import {
  validatedFindings,
  type FindingReference,
} from "./maintenance-domain.ts";

/** Reads one campaign at a time; no workspace-wide fan-out or invented defect endpoint. */
function Source({
  environmentId,
  onSelect,
  actionLabel = "Link to maintenance proposal ↗",
}: {
  client: CyberwaveClient;
  environmentId: string;
  actionLabel?: string;
  onSelect: (finding: FindingReference) => void;
}) {
  const [campaignId, setCampaignId] = useState("");
  const {
    data: campaign,
    loading,
    error,
  } = useEvidenceCollection(environmentId, campaignId);
  const findings = campaign ? validatedFindings(environmentId, campaign) : [];
  return (
    <section className="section-gap">
      <h3>Use a stored inspection finding</h3>
      <p className="compact muted">
        Choose a campaign, then link a finding whose latest review is validated.
        This is a campaign snapshot, not an asset-wide maintenance backlog.
      </p>
      <EvidenceCollectionBrowser
        environmentId={environmentId}
        selectedId={campaignId}
        onSelect={(c) => setCampaignId(c.uuid)}
      />
      {error && (
        <p role="alert" className="cw-error">
          {error.message} Use the branch backend for the inspection API.
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

export function MaintenanceSource(props: Parameters<typeof Source>[0]) {
  return (
    <Source key={`${props.client.baseUrl}:${props.environmentId}`} {...props} />
  );
}
