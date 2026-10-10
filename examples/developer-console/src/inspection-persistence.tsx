import { useEffect, useState } from "react";
import { EnvironmentBrowser } from "@cyberwave/react";
import {
  CyberwaveError,
  type CyberwaveClient,
  type Environment,
  type InspectionCampaign,
  type InspectionManifest,
} from "cyberwave";
import { ConnectedWorkbench } from "./workbench-connection.tsx";
import { demoFindings, type Finding } from "./inspection-domain.ts";

export function sampleManifest(
  index: number,
  prefix: string,
): InspectionManifest {
  return {
    external_id: `${prefix}-${index}`,
    name: `Synthetic culvert · ${index ? "Follow-up" : "Baseline"}`,
    asset_reference: "synthetic-north-culvert",
    reference_version: "synthetic-plan-v1",
    coverage: index ? 0.68 : 1,
    limitations: index
      ? "Coverage unavailable from 408–600 m"
      : "Synthetic demonstration, not real inspection evidence",
    observations: demoFindings.map((f) => {
      const o = f.observations[index];
      return {
        external_id: `${f.id}-${index}`,
        defect_external_id: `${prefix}-${f.id}`,
        kind: f.name,
        observed: o.observed,
        chainage_m: f.chainageM,
        limitation: o.limitation || "",
        evidence: o.observed
          ? {
              reference: `synthetic-video-${index}`,
              timestamp_us: o.evidenceSeconds * 1e6,
            }
          : null,
        measurement:
          o.observed && o.value !== undefined
            ? {
                value: o.value,
                unit: o.unit,
                uncertainty: o.uncertainty,
                method: "synthetic illustration",
                calibration_reference:
                  o.unit === "px" ? null : "synthetic-scale-v1",
              }
            : null,
        model_version: o.modelVersion,
        model_run_reference: `synthetic-run-${index}`,
        confidence: o.observed ? o.confidence : null,
      };
    }),
  };
}
function Persistence({
  client,
  finding,
}: {
  client: CyberwaveClient;
  finding: Finding;
}) {
  const [environment, setEnvironment] = useState<Environment>(),
    [campaigns, setCampaigns] = useState<
      Awaited<ReturnType<CyberwaveClient["inspections"]["list"]>>
    >([]),
    [campaign, setCampaign] = useState<InspectionCampaign>(),
    [prefix, setPrefix] = useState("sdk-inspection-demo-v1"),
    [reason, setReason] = useState(""),
    [status, setStatus] = useState(
      "Select an environment to load stored campaigns.",
    ),
    [busy, setBusy] = useState(false);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(client.baseUrl).hostname,
  );
  const observation = campaign?.observations.find((o) =>
    o.source.defect_external_id.endsWith(`-${finding.id}`),
  );
  const latest = observation?.reviews.at(-1);
  function failure(e: unknown) {
    setStatus(
      e instanceof CyberwaveError && e.status === 404
        ? "Inspection API unavailable on this backend. Use the development branch to test persistence."
        : (e as Error).message,
    );
  }
  useEffect(() => {
    setCampaign(undefined);
    setCampaigns([]);
    if (!environment) return;
    const abort = new AbortController();
    client.inspections
      .list(environment.uuid, {}, { signal: abort.signal })
      .then((rows) => {
        if (!abort.signal.aborted) {
          setCampaigns(rows);
          setStatus(`${rows.length} saved campaigns on this page.`);
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) failure(e);
      });
    return () => abort.abort();
  }, [client, environment]);
  async function importSamples() {
    if (!environment) return;
    setBusy(true);
    try {
      for (const index of [0, 1]) {
        const saved = await client.inspections.importCampaign(
          environment.uuid,
          sampleManifest(index, prefix),
        );
        setCampaign(saved);
      }
      setCampaigns(await client.inspections.list(environment.uuid));
      setStatus(
        "Two synthetic campaign manifests persisted. Repeating this import returns the same records.",
      );
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  async function load(uuid: string) {
    if (!environment || !uuid) return;
    setBusy(true);
    try {
      setCampaign(await client.inspections.get(environment.uuid, uuid));
      setStatus("Loaded stored source observations and review history.");
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  async function saveReview() {
    if (!environment || !observation || !campaign) return;
    if (finding.review === "proposed") {
      setStatus("Validate or reject the draft assessment above before saving.");
      return;
    }
    if (!reason.trim()) {
      setStatus("Add a reason before saving.");
      return;
    }
    setBusy(true);
    try {
      await client.inspections.review(environment.uuid, observation.uuid, {
        expected_revision: latest?.revision || 0,
        idempotency_key: crypto.randomUUID(),
        reason,
        assessment: {
          decision: finding.review,
          severity: finding.severity,
          priority: finding.priority,
          technical_state:
            finding.technical === "resolved"
              ? "not-assessable"
              : finding.technical,
        },
      });
      setCampaign(
        await client.inspections.get(environment.uuid, campaign.uuid),
      );
      setReason("");
      setStatus(
        "Review saved with authenticated reviewer identity. Source observations are unchanged.",
      );
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workbench-grid">
      <aside className="panel">
        <h3>Choose the owning environment</h3>
        <fieldset disabled={busy} className="workflow-fields">
          <EnvironmentBrowser
            selectedId={environment?.uuid}
            onSelect={setEnvironment}
          />
        </fieldset>
      </aside>
      <section className="panel">
        <h3>Persist evidence and review</h3>
        <p className="note">
          The development backend stores campaign metadata and append-only
          reviews. Video upload, delivery acceptance and maintenance
          synchronization are later increments. This example enables writes only
          to an authenticated localhost backend.
        </p>
        <div className="fields">
          <label>
            Sample import identifier
            <input
              value={prefix}
              maxLength={90}
              onChange={(e) => setPrefix(e.target.value)}
            />
          </label>
          <label>
            Stored campaign
            <select
              value={campaign?.uuid || ""}
              disabled={busy}
              onChange={(e) => load(e.target.value)}
            >
              <option value="">Select a campaign</option>
              {campaigns.map((c) => (
                <option key={c.uuid} value={c.uuid}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="toolbar">
          <button
            className="cw-button"
            disabled={!local || !environment || busy || !prefix.trim()}
            onClick={importSamples}
          >
            Import two synthetic campaigns
          </button>
          <button
            className="cw-button"
            disabled={!campaign || busy}
            onClick={() => load(campaign!.uuid)}
          >
            Reload saved history
          </button>
        </div>
        {observation && (
          <>
            <p>
              {finding.id} · source {observation.source.external_id} · revision{" "}
              {latest?.revision || 0}
            </p>
            <div className="fields">
              <label className="span-2">
                Server review reason
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            </div>
            <p className="compact muted">
              Draft decision: {finding.review}. Validate or reject the
              assessment above before persisting it.
            </p>
            <button
              className="cw-button cw-primary"
              disabled={!local || busy}
              onClick={saveReview}
            >
              Save current assessment of {finding.id}
            </button>
            <div className="review-log">
              {observation.reviews.map((r) => (
                <p key={r.uuid}>
                  Revision {r.revision} · {r.assessment.decision} ·{" "}
                  {r.created_at}
                  <br />
                  {r.reason}
                </p>
              ))}
            </div>
          </>
        )}
        <p role="status" className="status-line">
          {busy ? "Working…" : status}
        </p>
      </section>
    </div>
  );
}
export function InspectionPersistence({ finding }: { finding: Finding }) {
  return (
    <section className="section-gap">
      <h2>Use a real backend</h2>
      <ConnectedWorkbench>
        {(client) => (
          <Persistence key={client.baseUrl} client={client} finding={finding} />
        )}
      </ConnectedWorkbench>
    </section>
  );
}
