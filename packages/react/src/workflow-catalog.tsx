import { useEffect, useMemo, useRef, useState } from "react";
import { type CyberwaveClient, type Workflow } from "cyberwave";
import { WorkflowPlanner } from "./workflow-planner.js";
import { useResource } from "./resource.js";
import { workflowError } from "./workflow-monitor.js";
export function WorkflowCatalog({
  client,
  environmentId,
  workspaceId,
  onWorkflowSelected,
  readOnly = true,
  serverPagination = false,
}: {
  client: CyberwaveClient;
  environmentId?: string;
  workspaceId?: string;
  readOnly?: boolean;
  serverPagination?: boolean;
  onWorkflowSelected?: (workflow?: Workflow) => void;
}) {
  const scope = useRef({ client, environmentId, workspaceId });
  scope.current = { client, environmentId, workspaceId };
  const currentScope = () =>
    mounted.current &&
    scope.current.client === client &&
    scope.current.environmentId === environmentId &&
    scope.current.workspaceId === workspaceId;
  const selection = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      selection.current?.abort();
    };
  }, []);
  const [rows, setRows] = useState<Workflow[]>([]),
    [selected, setSelected] = useState<Workflow>();
  const [showTemplates, setShowTemplates] = useState(false);
  const templates = useResource(
    useMemo(
      () => (signal: AbortSignal) =>
        showTemplates
          ? client.workflows.templates({ signal })
          : Promise.resolve([]),
      [client, showTemplates],
    ),
  );
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
    if (!environmentId && !workspaceId) return;
    setStatus("Loading workflows…");
    client.workflows
      .list(
        {
          ...(serverPagination ? { limit: 21, offset: page * 20 } : {}),
          environment_uuid: environmentId,
          workspace_uuid: workspaceId,
          is_template: false,
          ...(view === "scheduled" ? { trigger_type: "schedule" } : {}),
        },
        { signal: abort.signal },
      )
      .then((items) => {
        if (!abort.signal.aborted) {
          setRows(
            serverPagination ? items : items.filter((w) => !w.is_template),
          );
          setStatus("");
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setStatus(workflowError(e));
      });
    return () => abort.abort();
  }, [
    client,
    environmentId,
    workspaceId,
    revision,
    view,
    serverPagination,
    serverPagination ? page : 0,
  ]);
  useEffect(() => {
    setPage(0);
  }, [client, environmentId, workspaceId, view]);
  async function select(uuid: string) {
    selection.current?.abort();
    const abort = new AbortController();
    selection.current = abort;
    setBusy(true);
    setSelected(undefined);
    onWorkflowSelected?.(undefined);
    try {
      const workflow = await client.workflows.get(uuid, {
        signal: abort.signal,
      });
      if (!abort.signal.aborted) {
        setSelected(workflow);
        onWorkflowSelected?.(workflow);
      }
    } catch (e) {
      if (!abort.signal.aborted) setStatus(workflowError(e));
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="cw-workflows">
      <h2>Workflows</h2>
      <div className="toolbar">
        <button
          className="cw-button"
          aria-pressed={view === "all"}
          disabled={busy}
          onClick={() => setView("all")}
        >
          All workflows
        </button>
        <button
          className="cw-button"
          aria-pressed={view === "scheduled"}
          disabled={busy}
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
          disabled={busy}
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
        {status ||
          `${(serverPagination ? rows.slice(0, 20) : rows).filter((w) => !w.is_template).length} ${view === "scheduled" ? "scheduled " : ""}workflows ${serverPagination ? "on this page" : "in this scope"}.`}
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
          {templates.loading && <p role="status">Loading templates…</p>}
          {templates.error && (
            <p role="alert">{workflowError(templates.error)}</p>
          )}
          {templates.data?.map((template) => (
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
        {(serverPagination
          ? rows.slice(0, 20)
          : rows.slice(page * 20, page * 20 + 20)
        )
          .filter((w) => !w.is_template)
          .map((w) => (
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
      {(rows.length > 20 || page > 0) && (
        <div className="toolbar">
          <button
            className="cw-button"
            disabled={busy || !page}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>Page {page + 1}</span>
          <button
            className="cw-button"
            disabled={
              busy ||
              (serverPagination
                ? rows.length <= 20
                : (page + 1) * 20 >= rows.length)
            }
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
          readOnly={readOnly}
          serverPagination={serverPagination}
          workflow={selected}
          environmentId={environmentId}
          workspaceId={workspaceId}
          onBusyChange={setBusy}
          onChange={(w) => {
            if (!currentScope()) return;
            // A completed save must not replace a newer user selection.
            setSelected((current) => (current?.uuid === w.uuid ? w : current));
            setRows((old) => {
              const matches =
                view !== "scheduled" ||
                w.nodes?.some(
                  (n) =>
                    n.node_type === "trigger" &&
                    n.trigger_type === "schedule" &&
                    !n.is_disabled,
                );
              if (!matches) return old.filter((row) => row.uuid !== w.uuid);
              return old.some((row) => row.uuid === w.uuid)
                ? old.map((row) => (row.uuid === w.uuid ? w : row))
                : [w, ...old];
            });
          }}
          onCreated={(w) => {
            // A clone may finish after the caller has selected another scope.
            if (!currentScope()) return;
            onWorkflowSelected?.(w);
            setStatus("Draft created. Configure its inputs before activation.");
            setRows((old) => [w, ...old]);
            setSelected((current) =>
              current?.uuid === selected.uuid ? w : current,
            );
            setShowTemplates(false);
          }}
        />
      )}
      <p className="compact muted">
        {serverPagination
          ? "Loads 20 workflows at a time from this backend."
          : "Compatibility mode: loads the scoped catalog and displays 20 workflows per page."}{" "}
        Only the selected graph is loaded.
      </p>
    </section>
  );
}
