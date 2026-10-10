import { useEffect, useRef, useState } from "react";
import { type CyberwaveClient, type Workflow } from "cyberwave";
import { WorkflowPlanner } from "./workflow-planner.tsx";
import { workflowError } from "./workflow-monitor.tsx";
export function WorkflowCatalog({
  client,
  environmentId,
  workspaceId,
}: {
  client: CyberwaveClient;
  environmentId?: string;
  workspaceId?: string;
}) {
  const selection = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => selection.current?.abort(), []);
  const [rows, setRows] = useState<Workflow[]>([]),
    [selected, setSelected] = useState<Workflow>();
  const [templates, setTemplates] = useState<Workflow[]>([]),
    [showTemplates, setShowTemplates] = useState(false);
  const [view, setView] = useState<"all" | "scheduled">("all"),
    [revision, refresh] = useState(0),
    [page, setPage] = useState(0);
  const [status, setStatus] = useState("Choose an environment or workspace."),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    selection.current?.abort();
    setBusy(false);
    setRows([]);
    setSelected(undefined);
    setPage(0);
    if (!environmentId && !workspaceId) return;
    setStatus("Loading workflows…");
    client.workflows
      .list(
        {
          environment_uuid: environmentId,
          workspace_uuid: workspaceId,
          ...(view === "scheduled" ? { trigger_type: "schedule" } : {}),
        },
        { signal: abort.signal },
      )
      .then((items) => {
        if (!abort.signal.aborted) {
          setRows(items.filter((w) => !w.is_template));
          setStatus(
            `${items.filter((w) => !w.is_template).length} ${view === "scheduled" ? "scheduled " : ""}workflows in this scope.`,
          );
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setStatus(workflowError(e));
      });
    return () => abort.abort();
  }, [client, environmentId, workspaceId, revision, view]);
  useEffect(() => {
    if (!showTemplates) return;
    const abort = new AbortController();
    client.workflows
      .templates({ signal: abort.signal })
      .then((items) => {
        if (!abort.signal.aborted) setTemplates(items);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setStatus(workflowError(e));
      });
    return () => abort.abort();
  }, [client, showTemplates]);
  async function select(uuid: string) {
    selection.current?.abort();
    const abort = new AbortController();
    selection.current = abort;
    setBusy(true);
    setSelected(undefined);
    try {
      const workflow = await client.workflows.get(uuid, {
        signal: abort.signal,
      });
      if (!abort.signal.aborted) setSelected(workflow);
    } catch (e) {
      if (!abort.signal.aborted) setStatus(workflowError(e));
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  return (
    <section>
      <h2>Workflows</h2>
      <div className="toolbar">
        <button
          className="cw-button"
          aria-pressed={view === "all"}
          onClick={() => setView("all")}
        >
          All workflows
        </button>
        <button
          className="cw-button"
          aria-pressed={view === "scheduled"}
          onClick={() => setView("scheduled")}
        >
          Scheduled
        </button>
        <button
          className="cw-button"
          onClick={() => {
            setView("all");
            setShowTemplates(!showTemplates);
          }}
        >
          Choose template
        </button>
        <button
          className="cw-button"
          disabled={busy}
          onClick={() => refresh(revision + 1)}
        >
          Refresh
        </button>
      </div>
      <p className="status-line" role="status">
        {status}
      </p>
      {view === "scheduled" && (
        <p className="note">
          Recurring workflows for this scope, including paused workflows. Select
          one to see timing, configured inputs and runs. Times describe intent;
          availability and concurrency can delay execution.
        </p>
      )}
      {showTemplates && (
        <div className="cw-resource-list">
          {templates.map((template) => (
            <button
              className="cw-resource"
              key={template.uuid}
              disabled={busy}
              onClick={() => select(template.uuid)}
            >
              <span>
                <strong>{template.name}</strong>
                <small>{template.description}</small>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="cw-resource-list">
        {rows.slice(page * 20, page * 20 + 20).map((w) => (
          <button
            className="cw-resource"
            key={w.uuid}
            disabled={busy}
            onClick={() => select(w.uuid)}
          >
            <span>
              <strong>{w.name}</strong>
              <small>
                {w.is_active ? "Active" : "Draft / paused"} ·{" "}
                {w.execution_target} · {w.run_on_edge ? "Edge" : "Cloud"}
              </small>
            </span>
          </button>
        ))}
      </div>
      {rows.length > 20 && (
        <div className="toolbar">
          <button
            className="cw-button"
            disabled={!page}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>Page {page + 1}</span>
          <button
            className="cw-button"
            disabled={(page + 1) * 20 >= rows.length}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
      {selected && (
        <WorkflowPlanner
          key={selected.uuid}
          client={client}
          workflow={selected}
          environmentId={environmentId}
          workspaceId={workspaceId}
          onChange={(w) => {
            setSelected(w);
            setRows((old) => old.map((row) => (row.uuid === w.uuid ? w : row)));
          }}
          onCreated={(w) => {
            setStatus("Draft created. Configure its inputs before activation.");
            setRows((old) => [w, ...old]);
            setSelected(w);
            setShowTemplates(false);
          }}
        />
      )}
      <p className="compact muted">
        The existing scoped list API is unpaginated. This example displays 20
        workflows per page and loads only the selected graph.
      </p>
    </section>
  );
}
