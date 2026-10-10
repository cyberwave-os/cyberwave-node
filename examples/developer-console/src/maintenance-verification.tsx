import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ConnectedWorkbench, downloadJson } from "./workbench-connection.tsx";
import { StoredVerification } from "./stored-verification.tsx";
import { WorkflowWorkbench } from "./workflow-workbench.tsx";
import {
  reconcileWorkOrder,
  verificationDecision,
  type WorkOrderUpdate,
  type Verification,
} from "./maintenance-domain.ts";
import "@cyberwave/react/styles.css";
import "./maintenance.css";

const exchangeKey = "synthetic-culvert-repair:1";
const initialVerification: Verification = {
  targetObserved: false,
  evidenceReference: "",
  campaignReference: "",
  reviewer: "",
  reason: "",
  outcome: "resolved",
  coveragePercent: 68,
  requiredCoveragePercent: 100,
  reviewed: false,
};
function App() {
  const [order, setOrder] = useState<WorkOrderUpdate>();
  const [incoming, setIncoming] = useState<WorkOrderUpdate>({
    exchangeKey,
    externalId: "DEMO-WO-1042",
    revision: 1,
    state: "accepted",
  });
  const [verification, setVerification] = useState(initialVerification);
  const [message, setMessage] = useState("No acknowledgement received."),
    [saved, setSaved] = useState<ReturnType<typeof verificationDecision>>();
  const decision = verificationDecision(order, verification);
  function patch(update: Partial<Verification>) {
    setVerification((old) => ({ ...old, ...update }));
    setSaved(undefined);
  }
  function apply() {
    try {
      const next = reconcileWorkOrder(exchangeKey, order, incoming);
      setMessage(
        next === order
          ? "Duplicate update acknowledged; nothing changed."
          : "Example inbox updated. Technical condition is unchanged.",
      );
      if (next !== order) {
        setOrder(next);
        setSaved(undefined);
      }
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <main className="studio">
      <div className="studio-heading">
        <div>
          <span className="studio-kicker">MAINTENANCE / VERIFY & ACCEPT</span>
          <h1>Work completed. Condition verified?</h1>
          <p>
            Keep maintenance progress, technical condition and delivery
            acceptance separate.
          </p>
        </div>
        <span className="tag amber">Synthetic exchange · browser only</span>
      </div>
      <div className="metric-row">
        <div>
          <strong>{order?.state ?? "No order"}</strong>
          <span>External work order</span>
        </div>
        <div>
          <strong>{saved?.technicalState ?? "Unverified"}</strong>
          <span>Reviewed technical condition</span>
        </div>
        <div>
          <strong>
            {saved?.delivery === "ready-for-acceptance"
              ? "Ready for review"
              : "Not accepted"}
          </strong>
          <span>Campaign delivery</span>
        </div>
      </div>
      <div className="maintenance-grid">
        <section className="panel">
          <h2>1. Receive a work-order update</h2>
          <p className="muted compact">
            Synthetic culvert repair · expected exchange key{" "}
            <code>{exchangeKey}</code>. Apply the same update twice, change its
            revision, or try an unrelated key.
          </p>
          <div className="fields">
            <label className="span-2">
              Exchange key
              <input
                value={incoming.exchangeKey}
                onChange={(e) =>
                  setIncoming({ ...incoming, exchangeKey: e.target.value })
                }
              />
            </label>
            <label>
              External work-order ID
              <input
                value={incoming.externalId}
                onChange={(e) =>
                  setIncoming({ ...incoming, externalId: e.target.value })
                }
              />
            </label>
            <label>
              Source revision
              <input
                type="number"
                min="1"
                value={incoming.revision}
                onChange={(e) =>
                  setIncoming({ ...incoming, revision: e.target.valueAsNumber })
                }
              />
            </label>
            <label className="span-2">
              Work-order state
              <select
                value={incoming.state}
                onChange={(e) =>
                  setIncoming({
                    ...incoming,
                    state: e.target.value as WorkOrderUpdate["state"],
                  })
                }
              >
                <option value="accepted">Accepted</option>
                <option value="in-progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
            </label>
          </div>
          <div className="toolbar">
            <button className="cw-button cw-primary" onClick={apply}>
              Apply example update
            </button>
            <button
              className="cw-button"
              onClick={() => {
                setIncoming({
                  ...incoming,
                  exchangeKey,
                  revision: (order?.revision ?? 0) + 1,
                  state: "completed",
                });
              }}
            >
              Prepare completion update
            </button>
          </div>
          <p role="status" className="note">
            {message}
          </p>
          <p className="compact muted">
            A real adapter uses the maintenance system's revision or event ID, a
            durable inbox/outbox and scoped external asset mapping. This local
            example sends no request and does not implement that connector.
          </p>
        </section>
        <section className="panel">
          <h2>2. Review the verification evidence</h2>
          <div className="fields">
            <label>
              Verification campaign
              <input
                value={verification.campaignReference}
                onChange={(e) => patch({ campaignReference: e.target.value })}
                placeholder="Verification campaign reference"
              />
            </label>
            <label>
              Evidence reference
              <input
                value={verification.evidenceReference}
                onChange={(e) => patch({ evidenceReference: e.target.value })}
                placeholder="Recording / observation reference"
              />
            </label>
            <label>
              Reviewer
              <input
                value={verification.reviewer}
                onChange={(e) => patch({ reviewer: e.target.value })}
                placeholder="Demo reviewer"
              />
            </label>
            <label>
              Technical assessment
              <select
                value={verification.outcome}
                onChange={(e) =>
                  patch({ outcome: e.target.value as Verification["outcome"] })
                }
              >
                <option value="resolved">Resolved after verification</option>
                <option value="still-present">Still present</option>
                <option value="not-assessable">Not assessable</option>
              </select>
            </label>
            <label>
              Campaign coverage · %
              <input
                type="number"
                min="0"
                max="100"
                value={verification.coveragePercent}
                onChange={(e) =>
                  patch({ coveragePercent: e.target.valueAsNumber })
                }
              />
            </label>
            <label>
              Agreed coverage · %
              <input
                type="number"
                min="1"
                max="100"
                value={verification.requiredCoveragePercent}
                onChange={(e) =>
                  patch({ requiredCoveragePercent: e.target.valueAsNumber })
                }
              />
            </label>
            <label className="span-2">
              Review reason
              <textarea
                value={verification.reason}
                onChange={(e) => patch({ reason: e.target.value })}
                placeholder="What evidence supports this assessment?"
              />
            </label>
          </div>
          <label className="maintenance-check">
            <input
              type="checkbox"
              checked={verification.targetObserved}
              onChange={(e) => patch({ targetObserved: e.target.checked })}
            />{" "}
            The repaired target was covered by a new inspection
          </label>
          <label className="maintenance-check">
            <input
              type="checkbox"
              checked={verification.reviewed}
              onChange={(e) => patch({ reviewed: e.target.checked })}
            />{" "}
            The expert has reviewed the evidence and assessment
          </label>
          {decision.issues.length > 0 && (
            <ul className="issues">
              {decision.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
          {!decision.coverageMet && (
            <p className="note">
              Campaign coverage is incomplete or invalid. A covered defect may
              be resolved, while the delivery still needs rework.
            </p>
          )}
          <div className="toolbar">
            <button
              className="cw-button cw-primary"
              disabled={decision.issues.length > 0}
              onClick={() => setSaved(decision)}
            >
              Record local assessment
            </button>
            <button
              className="cw-button"
              onClick={() =>
                patch({
                  targetObserved: true,
                  evidenceReference: "synthetic-video-post-repair@42s",
                  campaignReference: "synthetic-verification-03",
                  reviewer: "Demo reviewer",
                  reason:
                    "Synthetic exercise: repaired section covered and evidence reviewed.",
                  reviewed: true,
                })
              }
            >
              Fill synthetic evidence
            </button>
          </div>
          {saved && (
            <p role="status" className="maintenance-success">
              Assessment recorded locally: {saved.technicalState}. Delivery:{" "}
              {saved.delivery}.
            </p>
          )}
        </section>
      </div>
      <section className="panel section-gap">
        <h2>3. Retain the evidence trail</h2>
        <p>
          Completing a workflow is an execution result. Accepting a delivery and
          resolving a defect require their own evidence and review.
        </p>
        <div className="toolbar">
          <button
            className="cw-button"
            disabled={!saved}
            onClick={() =>
              downloadJson("maintenance-verification-draft.json", {
                schema: "cyberwave.example.verification.v1",
                synthetic: true,
                persistence: "browser-only",
                exchangeKey,
                order,
                verification,
                assessment: saved,
              })
            }
          >
            Export verification review
          </button>
          <a className="studio-link" href="/recording-review.html">
            Review recordings ↗
          </a>
          <a className="studio-link" href="/inspection-workbench.html">
            Open inspection history ↗
          </a>
          <a className="studio-link" href="/maintenance-planning.html">
            Plan maintenance ↗
          </a>
        </div>
        <p className="note">
          References and reviewer names above are illustrative user input. They
          are not validated evidence or authenticated approvals. The synthetic
          controls above do not update the backend. Use stored evidence below to
          record an authenticated resolution review. Work-order synchronization
          and delivery acceptance remain application responsibilities.
        </p>
      </section>
      <ConnectedWorkbench>
        {(client) => <StoredVerification client={client} />}
      </ConnectedWorkbench>
      <section className="section-gap">
        <h2>Schedule or run a verification visit</h2>
        <p className="muted">
          Use the existing workflow planner below against your selected API.
          Runs and schedules are real backend records; the synthetic review
          above remains independent.
        </p>
        <ConnectedWorkbench>
          {(client) => <WorkflowWorkbench client={client} />}
        </ConnectedWorkbench>
      </section>
    </main>
  );
}
createRoot(document.getElementById("app")!).render(<App />);
