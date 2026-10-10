import { createRoot } from "react-dom/client";
import { ConnectedWorkbench } from "./workbench-connection.tsx";
import { MissionCatalog } from "./mission-catalog.tsx";
import "@cyberwave/react/styles.css";
import "./workbench.css";

const primitives = [
  [
    "Template",
    "A reusable workflow recipe. Start from a pattern your team already understands.",
  ],
  [
    "Workflow",
    "The configured steps, inputs and targets. Reuse capabilities and other workflows.",
  ],
  ["Run", "One execution: its resolved targets, status, results and history."],
  [
    "Schedule",
    "Optional timing for runs. Start now, on an event, once later or repeatedly.",
  ],
];
function App() {
  return (
    <main className="studio">
      <div className="studio-heading">
        <div>
          <span className="studio-kicker">
            WORKFLOWS / PLANNING & GOVERNANCE
          </span>
          <h1>One workflow. Many ways to run.</h1>
          <p>
            Plan operational activity with the primitives Cyberwave already has.
          </p>
        </div>
        <span className="tag">Read-only catalog</span>
      </div>
      <section className="panel">
        <div className="comparison">
          {primitives.map(([name, description]) => (
            <article key={name}>
              <h3>{name}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <div className="plan-steps">
          <span>Choose template</span>
          <span>Configure inputs + targets</span>
          <span>Run now / schedule</span>
          <span>Monitor run</span>
        </div>
        <p className="note">
          <strong>Proposed simplification:</strong> “mission” can be the name
          your product gives an operational workflow run. New applications
          should not need another Mission or Plan record. This example reads
          current templates, workflows and runs; unified one-off scheduling and
          dynamic allocation are still backend increments.
        </p>
        <details>
          <summary>What are environments and tasks in this model?</summary>
          <p>
            An environment is where an activity happens; a twin is a
            participating resource. A capability step can call a controller,
            model or existing task implementation. They remain useful resources,
            without becoming separate planning systems. Workflows belong to a
            workspace and may bind an environment; multiple operating
            environments need explicit step references.
          </p>
        </details>
        <details>
          <summary>Can a workflow allocate work dynamically?</summary>
          <p>
            The proposed flow is: receive requirements → select an eligible
            resource → record the assignment → run capability steps or a
            subworkflow. Reuse workflow inputs, conditions and loops. Start with
            a selected robot and add an allocation step only when needed.
            Availability, capability checks and exclusive claims belong on the
            server.
          </p>
          <p>
            Some edge nodes require targets fixed before compilation. Dynamic
            selection must respect that boundary. Recording the selected target
            and policy revision makes retries and reallocation understandable.
          </p>
        </details>
        <details>
          <summary>What already exists, and what still needs work?</summary>
          <p>
            Templates, configured workflows, executions, interval/cron triggers
            and Run Workflow nodes exist. A trigger accepting a request is not
            proof that a child run completed. Durable one-off scheduling, full
            child-run lineage, waiting, cancellation and resource claims need
            explicit contracts.
          </p>
          <p>
            The older Mission model stores task sequences for one twin. Its
            definitions and runs are shown below for compatibility; migrate
            existing consumers only after checking execution semantics and
            preserving history.
          </p>
        </details>
        <div className="comparison section-gap">
          <article>
            <h3>Logistics</h3>
            <p>
              Choose delivery template → assign an available robot → navigate →
              invoke handover workflow → monitor completion.
            </p>
          </article>
          <article>
            <h3>Inspection</h3>
            <p>
              Import or acquire evidence → analysis workflow → human review.
              Supplier evidence requires no robot mission.
            </p>
          </article>
          <article>
            <h3>Manufacturing</h3>
            <p>
              Claim a station → supported motion → quality workflow → release
              the station.
            </p>
          </article>
          <article>
            <h3>Aerial operations</h3>
            <p>
              Prepare flight constraints → approved aircraft adapter → evidence
              workflow. A Cesium preview cannot authorize flight.
            </p>
          </article>
        </div>
      </section>
      <section className="section-gap">
        <ConnectedWorkbench>
          {(client) => <MissionCatalog key={client.baseUrl} client={client} />}
        </ConnectedWorkbench>
      </section>
    </main>
  );
}
createRoot(document.getElementById("app")!).render(<App />);
