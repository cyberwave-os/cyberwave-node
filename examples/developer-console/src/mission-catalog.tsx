import { WorkflowCatalog } from "./workflow-catalog.tsx";
import { useEffect, useState } from "react";
import { EnvironmentBrowser } from "@cyberwave/react";
import {
  CyberwaveError,
  type CyberwaveClient,
  type Environment,
  type Mission,
  type MissionExecution,
} from "cyberwave";

export function MissionCatalog({ client }: { client: CyberwaveClient }) {
  const [environment, setEnvironment] = useState<Environment>(),
    [workspace, setWorkspace] = useState(""),
    [loadedWorkspace, setLoadedWorkspace] = useState(""),
    [missions, setMissions] = useState<Mission[]>([]),
    [selected, setSelected] = useState<Mission>(),
    [executions, setExecutions] = useState<MissionExecution[]>([]),
    [status, setStatus] = useState(
      "Select an environment or enter a workspace UUID.",
    ),
    [runStatus, setRunStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [offset, setOffset] = useState(0),
    [scope, setScope] = useState<"environment" | "workspace">("environment");
  useEffect(() => {
    if (scope === "environment" && !environment) return;
    if (scope === "workspace" && !loadedWorkspace) return;
    const abort = new AbortController();
    setMissions([]);
    setSelected(undefined);
    setStatus("Loading mission definitions…");
    setBusy(true);
    (async () => {
      if (scope === "workspace") {
        try {
          const rows = await client.missions.forWorkspace(
            loadedWorkspace,
            { limit: 20, offset },
            { signal: abort.signal },
          );
          if (!abort.signal.aborted) {
            setMissions(rows);
            setStatus(
              "Workspace governance view · only missions readable by this identity.",
            );
          }
        } catch (error) {
          if (!abort.signal.aborted)
            setStatus(
              error instanceof CyberwaveError && error.status === 404
                ? "Workspace mission discovery is unavailable or this workspace is not accessible."
                : (error as Error).message,
            );
        } finally {
          if (!abort.signal.aborted) setBusy(false);
        }
        return;
      }
      if (!environment) return;
      try {
        const rows = await client.environments.missions(
          environment.uuid,
          { limit: 20, offset },
          { signal: abort.signal },
        );
        if (!abort.signal.aborted) {
          setMissions(rows);
          setStatus(
            "Environment mission API · definitions assigned to twins currently in this environment.",
          );
        }
      } catch (e) {
        if (abort.signal.aborted) return;
        if (e instanceof CyberwaveError && e.status === 404) {
          try {
            const twins = await client.environments.twins(environment.uuid, {
                signal: abort.signal,
              }),
              rows: Mission[] = [];
            for (let i = 0; i < twins.length; i += 6) {
              const batch = await Promise.all(
                twins
                  .slice(i, i + 6)
                  .map((t) =>
                    client.missions.list(t.uuid, { signal: abort.signal }),
                  ),
              );
              rows.push(...batch.flat());
            }
            if (!abort.signal.aborted) {
              rows.sort(
                (a, b) =>
                  b.created_at.localeCompare(a.created_at) ||
                  b.uuid.localeCompare(a.uuid),
              );
              setMissions(rows.slice(offset, offset + 20));
              setStatus(
                "Compatibility path: environment → twins → saved missions. Direct environment discovery is not deployed here.",
              );
            }
          } catch (failure) {
            if (!abort.signal.aborted) setStatus((failure as Error).message);
          }
        } else setStatus((e as Error).message);
      } finally {
        if (!abort.signal.aborted) setBusy(false);
      }
    })();
    return () => abort.abort();
  }, [client, environment, loadedWorkspace, offset, scope]);
  useEffect(() => {
    setExecutions([]);
    setRunStatus("");
    if (!selected) return;
    const abort = new AbortController();
    client.missions
      .executions(selected.twin_uuid, selected.uuid, { signal: abort.signal })
      .then((rows) => {
        if (!abort.signal.aborted) {
          setExecutions(rows);
          setRunStatus(
            rows.length
              ? "Latest 50 executions."
              : "No executions yet. Saving a definition does not schedule it.",
          );
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setRunStatus(e.message);
      });
    return () => abort.abort();
  }, [client, selected]);
  function loadWorkspace() {
    setScope("workspace");
    setLoadedWorkspace(workspace.trim());
    setOffset(0);
  }
  function page(next: number) {
    setOffset(next);
  }
  return (
    <div className="workbench-grid">
      <aside className="panel">
        <h2>Choose scope</h2>
        <EnvironmentBrowser
          selectedId={environment?.uuid}
          onSelect={(env) => {
            setScope("environment");
            setOffset(0);
            setEnvironment(env);
          }}
        />
        <div className="section-gap fields span-2">
          <label className="span-2">
            Workspace UUID
            <input
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              placeholder="For a workspace-wide overview"
            />
          </label>
          <button
            className="cw-button"
            disabled={!workspace.trim() || busy}
            onClick={() => loadWorkspace()}
          >
            Load workspace missions
          </button>
        </div>
      </aside>
      <section className="panel">
        <WorkflowCatalog
          client={client}
          environmentId={
            scope === "environment" ? environment?.uuid : undefined
          }
          workspaceId={scope === "workspace" ? loadedWorkspace : undefined}
        />
        <h2 className="section-gap">Legacy task-sequence missions</h2>
        <p role="status" className="status-line">
          {status}
        </p>
        <div className="cw-resource-list">
          {missions.map((m) => (
            <button
              className={`cw-resource ${selected?.uuid === m.uuid ? "cw-selected" : ""}`}
              key={m.uuid}
              onClick={() => setSelected(m)}
            >
              <span>
                <strong>{m.name || "Untitled mission"}</strong>
                <small>
                  {m.task_sequence.length} tasks · twin {m.twin_uuid}
                </small>
              </span>
            </button>
          ))}
        </div>
        <div className="toolbar">
          <button
            className="cw-button"
            disabled={busy || offset === 0}
            onClick={() => page(Math.max(0, offset - 20))}
          >
            Previous
          </button>
          <span>Page {offset / 20 + 1}</span>
          <button
            className="cw-button"
            disabled={busy || missions.length < 20}
            onClick={() => page(offset + 20)}
          >
            Next
          </button>
        </div>
        {selected && (
          <>
            <h3>{selected.name} · runs</h3>
            <p>{selected.description}</p>
            <p className="muted compact">{runStatus}</p>
            {executions.map((run) => (
              <article className="note" key={run.uuid}>
                <strong>{run.status}</strong> ·{" "}
                {run.dry_run ? "dry run" : "execution"}
                <br />
                {run.start_at
                  ? `Requested start ${new Date(run.start_at).toLocaleString()}`
                  : "No scheduled start"}
                <br />
                <small>{run.uuid}</small>
              </article>
            ))}
          </>
        )}
        <p className="note">
          This catalog reads backend state. Saving a mission, requesting a run
          and simulating a route are separate actions. A queued dry run is not a
          flight validation.
        </p>
      </section>
    </div>
  );
}
