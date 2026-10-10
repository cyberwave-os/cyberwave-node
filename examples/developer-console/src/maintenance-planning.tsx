import { useState } from "react";
import { createRoot } from "react-dom/client";
import { EnvironmentBrowser } from "@cyberwave/react";
import type { CyberwaveClient, Environment } from "cyberwave";
import { ConnectedWorkbench, downloadJson } from "./workbench-connection.tsx";
import { WorkflowCatalog } from "./workflow-catalog.tsx";
import { MaintenanceSource } from "./maintenance-source.tsx";
import {
  demoReservation,
  initialProposal,
  maintenanceHandoff,
  planningIssues,
  type MaintenanceProposal,
} from "./maintenance-domain.ts";
import "@cyberwave/react/styles.css";
import "./maintenance.css";

function Planning({ client }: { client: CyberwaveClient }) {
  const [proposal, setProposal] = useState(() =>
    initialProposal(crypto.randomUUID()),
  );
  const [environment, setEnvironment] = useState<Environment>();
  const [workflowId, setWorkflowId] = useState("");
  const issues = planningIssues(proposal, [demoReservation]);
  function patch(update: Partial<MaintenanceProposal>) {
    setProposal((old) => ({ ...old, ...update, revision: old.revision + 1 }));
  }
  return (
    <>
      <div className="metric-row">
        <div>
          <strong>01</strong>
          <span>Prepare the work</span>
        </div>
        <div>
          <strong>02</strong>
          <span>Link findings and a workflow</span>
        </div>
        <div>
          <strong>03</strong>
          <span>Exchange with maintenance</span>
        </div>
      </div>
      <div className="maintenance-grid">
        <section className="panel">
          <h2>Maintenance proposal</h2>
          <div className="fields">
            <label>
              Work type
              <select
                value={proposal.purpose}
                onChange={(e) =>
                  patch({
                    purpose: e.target.value as MaintenanceProposal["purpose"],
                    finding: undefined,
                  })
                }
              >
                <option value="preventive">Preventive check</option>
                <option value="corrective">
                  Work from a validated finding
                </option>
              </select>
            </label>
            <label>
              Maintenance priority
              <select
                value={proposal.priority}
                onChange={(e) =>
                  patch({
                    priority: e.target.value as MaintenanceProposal["priority"],
                  })
                }
              >
                <option value="routine">Routine</option>
                <option value="planned">Planned</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label>
              Business unit
              <input
                value={proposal.businessUnit}
                onChange={(e) => patch({ businessUnit: e.target.value })}
              />
            </label>
            <label>
              External asset reference
              <input
                value={proposal.assetReference}
                disabled={Boolean(proposal.finding)}
                onChange={(e) => patch({ assetReference: e.target.value })}
              />
            </label>
            <label>
              Responsible team
              <input
                value={proposal.owner}
                onChange={(e) => patch({ owner: e.target.value })}
              />
            </label>
            <label>
              Crew
              <select
                value={proposal.crew}
                onChange={(e) => patch({ crew: e.target.value })}
              >
                <option value="mechanical-team">Mechanical team</option>
                <option value="inspection-team">Inspection team</option>
              </select>
            </label>
            <label className="span-2">
              Work description
              <textarea
                value={proposal.summary}
                onChange={(e) => patch({ summary: e.target.value })}
              />
            </label>
            <label>
              Window start · ISO with offset
              <input
                value={proposal.windowStart}
                onChange={(e) => patch({ windowStart: e.target.value })}
              />
            </label>
            <label>
              Window end · ISO with offset
              <input
                value={proposal.windowEnd}
                onChange={(e) => patch({ windowEnd: e.target.value })}
              />
            </label>
            <label>
              Estimated duration · minutes
              <input
                type="number"
                min="1"
                value={proposal.durationMinutes}
                onChange={(e) =>
                  patch({ durationMinutes: e.target.valueAsNumber })
                }
              />
            </label>
          </div>
          <label className="maintenance-check">
            <input
              type="checkbox"
              checked={proposal.partsReady}
              onChange={(e) => patch({ partsReady: e.target.checked })}
            />{" "}
            Parts and tools ready
          </label>
          <label className="maintenance-check">
            <input
              type="checkbox"
              checked={proposal.accessReady}
              onChange={(e) => patch({ accessReady: e.target.checked })}
            />{" "}
            Site owner confirmed access and isolation arrangements
          </label>
          <p className="note">
            This work window is a proposal. It does not reserve a crew or
            schedule a workflow. Authorize access in the site's existing
            process; these checkboxes illustrate application checks.
          </p>
        </section>
        <section className="panel">
          <h2>Readiness & handoff</h2>
          <div className="maintenance-reservation">
            <span className="tag amber">Sample reservation</span>
            <h3>{demoReservation.name}</h3>
            <p>Mechanical team · 3 Nov 2026 · 09:00–10:00 UTC</p>
            <small>
              Change the proposed window to test a crew conflict. This is a
              local overlap check, not a resource lock.
            </small>
          </div>
          <h3>
            {issues.length
              ? `${issues.length} checks to address`
              : "Proposal ready for structured exchange"}
          </h3>
          {issues.length ? (
            <ul className="issues">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : (
            <p className="maintenance-success" role="status">
              The proposal passes these example checks.
            </p>
          )}
          {proposal.finding ? (
            <>
              <h3>Linked finding</h3>
              <p>
                {proposal.finding.name} · {proposal.finding.technicalState}
              </p>
              <p className="compact muted">
                Technical severity: {proposal.finding.severity}. Review
                revision: {proposal.finding.revision}. Maintenance priority
                remains a separate planning choice.
              </p>
              <button
                className="cw-button"
                onClick={() => patch({ finding: undefined })}
              >
                Remove finding
              </button>
            </>
          ) : (
            <p className="muted compact">
              A preventive check does not need a defect. Corrective work needs a
              validated finding selected below.
            </p>
          )}
          <p className="compact muted">
            Workflow reference:{" "}
            {workflowId ||
              "Choose or create a workflow below (optional for manual work)."}
          </p>
          <button
            className="cw-button cw-primary"
            disabled={issues.length > 0}
            onClick={() =>
              downloadJson("maintenance-proposal.json", {
                ...maintenanceHandoff(proposal, [demoReservation]),
                  apiOrigin: client.baseUrl,
                workflow: workflowId
                  ? {
                      apiOrigin: client.baseUrl,
                      environmentId: environment?.uuid,
                      uuid: workflowId,
                    }
                  : null,
              })
            }
          >
            Export maintenance proposal
          </button>
          <p className="compact muted">
            The same proposal revision keeps the same exchange key. No work
            order has been submitted. A server adapter must own durable
            delivery, acknowledgement and retries.
          </p>
          <a className="studio-link" href="/maintenance-verification.html">
            Try work-order updates & verification ↗
          </a>
        </section>
      </div>
      <div className="workbench-grid section-gap">
        <aside className="panel">
          <h2>Cyberwave environment</h2>
          <EnvironmentBrowser
            selectedId={environment?.uuid}
            onSelect={(env) => {
              setEnvironment(env);
              setWorkflowId("");
              patch({ finding: undefined });
            }}
          />
          <p className="compact muted">
            Uses the API selected in the header. Load a campaign for corrective
            work, or plan preventive activity directly.
          </p>
          <a className="studio-link" href="/inspection-workbench.html">
            Review inspection evidence ↗
          </a>
        </aside>
        <section className="panel">
          {environment ? (
            <>
              <MaintenanceSource
                key={environment.uuid}
                client={client}
                environmentId={environment.uuid}
                onSelect={(finding) =>
                  patch({
                    purpose: "corrective",
                    finding,
                    assetReference: finding.assetReference,
                    summary: `Assess and address ${finding.name}`,
                    priority:
                      finding.priority as MaintenanceProposal["priority"],
                  })
                }
              />
              <div className="section-gap">
                <h2>Run or schedule the activity</h2>
                <p className="compact muted">
                  Reuse a workflow template for a routine check, evidence
                  acquisition or a verification visit. Configure the template's
                  declared inputs, then run now or enable recurring timing. This
                  workflow runs independently of the draft's readiness checks
                  and external work order.
                </p>
                <WorkflowCatalog
                  key={environment.uuid}
                  client={client}
                  environmentId={environment.uuid}
                  onWorkflowSelected={(workflow) => {
                    setWorkflowId(
                      workflow?.is_template ? "" : (workflow?.uuid ?? ""),
                    );
                    patch({});
                  }}
                />
              </div>
            </>
          ) : (
            <p className="muted">
              Select an environment to load findings, workflow templates and
              schedules.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
function App() {
  return (
    <main className="studio">
      <div className="studio-heading">
        <div>
          <span className="studio-kicker">MAINTENANCE / PLAN & COORDINATE</span>
          <h1>From asset condition to planned work.</h1>
          <p>
            Prepare preventive checks or corrective work, then reuse Cyberwave
            workflows for execution.
          </p>
        </div>
        <span className="tag amber">Local proposal · real API reads</span>
      </div>
      <ConnectedWorkbench>
        {(client) => <Planning client={client} />}
      </ConnectedWorkbench>
      <details className="panel section-gap">
        <summary>Reuse across industries</summary>
        <div className="comparison">
          <article>
            <h3>Utilities & infrastructure</h3>
            <p>
              Review a culvert defect → prepare corrective work with access
              constraints → verify the repaired section. A completed repair does
              not clear the defect automatically.
            </p>
          </article>
          <article>
            <h3>Manufacturing & logistics</h3>
            <p>
              Prepare a conveyor or pump check during a shutdown window → select
              crew and tools → schedule an evidence collection workflow. Keep
              maintenance orders in the existing maintenance system.
            </p>
          </article>
        </div>
      </details>
    </main>
  );
}
createRoot(document.getElementById("app")!).render(<App />);
