import { useEffect, useState } from "react";
import type { CyberwaveClient, Workflow, WorkflowExecution } from "cyberwave";

/** A separate projection of the existing engine, not a second plan store. */
export function WorkflowCatalog({
  client,
  environmentId,
  workspaceId,
}: {
  client: CyberwaveClient;
  environmentId?: string;
  workspaceId?: string;
}) {
  const [rows, setRows] = useState<Workflow[]>([]);
  const [selected, setSelected] = useState<Workflow>();
  const [runs, setRuns] = useState<WorkflowExecution[]>([]);
  const [status, setStatus] = useState(
    "Choose a scope to discover workflow plans.",
  );
  const [runStatus, setRunStatus] = useState("");
  const [page, setPage] = useState(0);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<
    Awaited<ReturnType<CyberwaveClient["workflows"]["templates"]>>
  >([]);
  const [templateStatus, setTemplateStatus] = useState("");
  useEffect(() => {
    if (!showTemplates) return;
    const abort = new AbortController();
    setTemplates([]);
    setTemplateStatus("Loading templates…");
    client.workflows
      .templates({ signal: abort.signal })
      .then((items) => {
        if (!abort.signal.aborted) {
          setTemplates(items);
          setTemplateStatus(
            `${items.length} available templates. Templates are listed by their own access rules, independently of the selected environment.`,
          );
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) setTemplateStatus(error.message);
      });
    return () => abort.abort();
  }, [client, showTemplates]);
  useEffect(() => {
    const abort = new AbortController();
    setRows([]);
    setSelected(undefined);
    setPage(0);
    if (!environmentId && !workspaceId) return;
    setStatus("Loading workflow plans…");
    client.workflows
      .list(
        { environment_uuid: environmentId, workspace_uuid: workspaceId },
        { signal: abort.signal },
      )
      .then((items) => {
        if (!abort.signal.aborted) {
          setRows(items);
          setStatus(items.length + " workflows in this scope.");
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) setStatus(error.message);
      });
    return () => abort.abort();
  }, [client, environmentId, workspaceId]);
  useEffect(() => {
    const abort = new AbortController();
    setRuns([]);
    setRunStatus("");
    if (!selected) return;
    setRunStatus("Loading runs…");
    client.workflows
      .executions(selected.uuid, { signal: abort.signal })
      .then((items) => {
        if (!abort.signal.aborted) {
          setRuns(items);
          setRunStatus(
            items.length ? "Recent backend executions" : "No executions yet.",
          );
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) setRunStatus(error.message);
      });
    return () => abort.abort();
  }, [client, selected]);
  return (
    <section className="section-gap">
      <h2>Workflows & runs</h2>
      <button
        className="cw-button"
        onClick={() => setShowTemplates(!showTemplates)}
      >
        {showTemplates ? "Hide templates" : "Browse workflow templates"}
      </button>
      {showTemplates && (
        <>
          <p className="status-line">{templateStatus}</p>
          <div className="comparison">
            {templates.slice(0, 20).map((template) => (
              <article key={template.uuid}>
                <h3>{template.name}</h3>
                <p>{template.description}</p>
              </article>
            ))}
          </div>
          <p className="compact muted">
            Showing at most 20 templates from the existing unpaginated API. This
            browser does not clone or execute them.
          </p>
        </>
      )}
      <p className="status-line" role="status">
        {status}
      </p>
      <div className="cw-resource-list">
        {rows.slice(page * 20, page * 20 + 20).map((workflow) => (
          <button
            key={workflow.uuid}
            className={
              "cw-resource " +
              (selected?.uuid === workflow.uuid ? "cw-selected" : "")
            }
            onClick={() => setSelected(workflow)}
          >
            <span>
              <strong>{workflow.name}</strong>
              <small>
                {workflow.run_on_edge ? "Edge" : "Cloud"} ·{" "}
                {workflow.is_active ? "Active" : "Draft"} ·{" "}
                {workflow.environment_name || "Workspace automation"}
              </small>
            </span>
          </button>
        ))}
      </div>
      {rows.length > 20 && (
        <div className="toolbar">
          <button
            className="cw-button"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous workflows
          </button>
          <span>Page {page + 1}</span>
          <button
            className="cw-button"
            disabled={(page + 1) * 20 >= rows.length}
            onClick={() => setPage(page + 1)}
          >
            Next workflows
          </button>
        </div>
      )}
      {selected && (
        <>
          <h3>{selected.name} · runs</h3>
          <p>{selected.description}</p>
          <p className="compact muted">{runStatus}</p>
          {runs.map((run) => (
            <article className="note" key={run.uuid}>
              <strong>{run.status}</strong> ·{" "}
              {new Date(run.started_at).toLocaleString()}
              <br />
              <small>{run.uuid}</small>
            </article>
          ))}
        </>
      )}
      <p className="note">
        Existing API: GET /workflows with environment_uuid or workspace_uuid.
        This endpoint currently returns the complete scoped list; these display
        pages do not bound backend work. Server pagination and a unified run
        index are the next governance increment.
      </p>
    </section>
  );
}
