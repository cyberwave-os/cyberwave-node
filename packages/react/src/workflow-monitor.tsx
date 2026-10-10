import { useEffect, useState } from "react";
import {
  CyberwaveError,
  type CyberwaveClient,
  type Workflow,
  type WorkflowExecution,
} from "cyberwave";
export function workflowError(error: unknown) {
  return error instanceof CyberwaveError &&
    typeof error.detail === "object" &&
    error.detail &&
    "detail" in error.detail
    ? String(error.detail.detail)
    : error instanceof Error
      ? error.message
      : String(error);
}
export function WorkflowMonitor({
  client,
  workflow,
  readOnly = true,
  serverPagination = false,
}: {
  client: CyberwaveClient;
  readOnly?: boolean;
  serverPagination?: boolean;
  workflow: Workflow;
}) {
  const [page, setPage] = useState(0);
  const [runs, setRuns] = useState<WorkflowExecution[]>([]),
    [detail, setDetail] = useState<WorkflowExecution>(),
    [runId, setRunId] = useState(""),
    [status, setStatus] = useState("Loading runs…");
  const [tick, setTick] = useState(0),
    [canceling, setCanceling] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        if (document.visibilityState === "visible") {
          const items = await client.workflows.executions(workflow.uuid, {
            ...(serverPagination ? { limit: 11, offset: page * 10 } : {}),
            signal: abort.signal,
          });
          const id = runId || items[0]?.uuid;
          const next = id
            ? await client.workflows.execution(workflow.uuid, id, {
                signal: abort.signal,
              })
            : undefined;
          if (!abort.signal.aborted) {
            setRuns(items);
            setDetail(next);
            setStatus(
              items.length
                ? "Updated " + new Date().toLocaleTimeString()
                : "No executions yet.",
            );
          }
        }
      } catch (e) {
        if (!abort.signal.aborted)
          setStatus(
            workflowError(e) + " · Monitoring paused. Refresh to retry.",
          );
        return;
      }
      if (!abort.signal.aborted) timer = setTimeout(poll, 5000);
    }
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [client, workflow.uuid, runId, tick, page, serverPagination]);
  async function cancel() {
    if (!detail || canceling) return;
    setCanceling(true);
    try {
      await client.workflows.cancel(detail.uuid);
      setTick((t) => t + 1);
    } catch (e) {
      setStatus(workflowError(e));
    } finally {
      setCanceling(false);
    }
  }
  return (
    <section className="cw-workflows section-gap">
      <h3>Execution monitor</h3>
      <p role="status">{status}</p>
      <button className="cw-button" onClick={() => setTick((t) => t + 1)}>
        Refresh runs
      </button>
      <div className="cw-resource-list">
        {runs.slice(0, 10).map((run) => (
          <button
            className="cw-resource"
            key={run.uuid}
            onClick={() => setRunId(run.uuid)}
          >
            <span>
              <strong>{run.status}</strong>
              <small>
                {new Date(run.started_at).toLocaleString()} · {run.uuid}
              </small>
            </span>
          </button>
        ))}
      </div>
      {serverPagination && (
        <div className="toolbar">
          <button
            className="cw-button"
            disabled={!page}
            onClick={() => {
              setRunId("");
              setPage(page - 1);
            }}
          >
            Newer runs
          </button>
          <span>Page {page + 1}</span>
          <button
            className="cw-button"
            disabled={runs.length <= 10}
            onClick={() => {
              setRunId("");
              setPage(page + 1);
            }}
          >
            Older runs
          </button>
        </div>
      )}
      {detail && (
        <article className="note">
          <strong>{detail.status}</strong>
          <p>{detail.error_message}</p>
          {["running", "waiting", "requested"].includes(detail.status) && (
            <button
              className="cw-button"
              disabled={
                canceling || (!!runId && detail.uuid !== runId) || readOnly
              }
              onClick={cancel}
            >
              {canceling ? "Canceling…" : "Cancel run"}
            </button>
          )}
          {detail.node_executions?.map((node) => (
            <p key={node.uuid}>
              {workflow.nodes?.find((n) => n.uuid === node.node_uuid)?.name ??
                node.node_uuid}{" "}
              · {node.status}
              {node.error_message ? " · " + node.error_message : ""}
            </p>
          ))}
          <details>
            <summary>Run inputs and results</summary>
            <pre>
              {JSON.stringify(
                {
                  inputs: detail.trigger_data,
                  nodes: detail.node_executions?.map((n) => ({
                    node: n.node_uuid,
                    input: n.input_data,
                    output: n.output_data,
                  })),
                },
                null,
                2,
              )}
            </pre>
          </details>
        </article>
      )}
    </section>
  );
}
