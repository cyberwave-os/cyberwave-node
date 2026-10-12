import { useState } from "react";
import {
  EnvironmentBrowser,
  EvidenceVerificationPanel,
} from "@cyberwave/react";
import type { CyberwaveClient, Environment } from "cyberwave";
import { MaintenanceSource } from "./maintenance-source.tsx";
import type { FindingReference } from "./maintenance-domain.ts";
import { workflowError } from "@cyberwave/react";
export function StoredVerification({ client }: { client: CyberwaveClient }) {
  const [environment, setEnvironment] = useState<Environment>();
  const [baseline, setBaseline] = useState<FindingReference>();
  const [status, setStatus] = useState(""),
    [revision, refresh] = useState(0),
    [busy, setBusy] = useState(false);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(client.baseUrl).hostname,
  );
  async function importFixture() {
    if (!baseline || !local || environment?.name !== "SDK inspection sandbox")
      return;
    setBusy(true);
    try {
      const campaign = await client.evidence.get(
        baseline.environmentId,
        baseline.campaignId,
      );
      const observation = campaign.records.find(
        (item) => item.uuid === baseline.observationId,
      )!;
      await client.evidence.importCollection(baseline.environmentId, {
        external_id: "sdk-verification-" + baseline.observationId,
        name: "Synthetic verification visit",
        asset_reference: campaign.asset_reference,
        reference_version: campaign.reference_version,
        coverage: 0.68,
        limitations:
          "Synthetic SDK fixture. Partial campaign coverage; not a real maintenance result.",
        records: [
          {
            external_id: "synthetic-covered-absence",
            subject_external_id: observation.source.subject_external_id,
            kind: observation.source.kind,
            observed: false,
            target_covered: true,
            limitation:
              "Synthetic target inspected; previous finding absent. Remaining campaign targets not covered.",
            evidence: { reference: "synthetic-verification-frame:1" },
          },
        ],
      });
      refresh(revision + 1);
      setStatus(
        "Synthetic evidence stored. Select it below and record a reason to test persistence.",
      );
    } catch (error) {
      setStatus(workflowError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section-gap">
      <h2>Verify evidence stored in Cyberwave</h2>
      <p>
        Select a reviewed finding as the baseline, then choose later evidence
        for the same target. Reload the page to inspect the saved review.
      </p>
      <div className="workbench-grid">
        <aside className="panel">
          <EnvironmentBrowser
            selectedId={environment?.uuid}
            onSelect={(env) => {
              setEnvironment(env);
              setBaseline(undefined);
              setStatus("");
            }}
          />
        </aside>
        <section className="panel">
          {environment && (
            <MaintenanceSource
              key={environment.uuid}
              client={client}
              environmentId={environment.uuid}
              actionLabel="Use as verification baseline ↗"
              onSelect={setBaseline}
            />
          )}
          {baseline && (
            <>
              {local && environment?.name === "SDK inspection sandbox" && (
                <button
                  className="cw-button"
                  disabled={busy}
                  onClick={importFixture}
                >
                  Import synthetic verification visit
                </button>
              )}
              <p role="status">{status}</p>
              <EvidenceVerificationPanel
                key={baseline.reviewId + revision}
                client={client}
                environmentId={baseline.environmentId}
                subjectId={baseline.subjectId}
                baselineReviewId={baseline.reviewId}
                severity={baseline.severity}
                priority={baseline.priority}
                readOnly={!local}
              />
            </>
          )}
        </section>
      </div>
    </section>
  );
}
