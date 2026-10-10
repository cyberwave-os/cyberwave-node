import { useEffect, useState } from "react";
import {
  workflowEditableFields,
  workflowNodePatch,
  workflowSchedules,
  type CyberwaveClient,
  type Workflow,
  type Twin,
  type components,
  type WorkflowInputContract,
  CyberwaveError,
} from "cyberwave";
import { WorkflowMonitor, workflowError } from "./workflow-monitor.js";
import { workflowFieldText, workflowInputUpdates } from "cyberwave";

export function WorkflowPlanner({
  client,
  workflow,
  environmentId,
  workspaceId,
  onChange,
  onCreated,
  onBusyChange,
  readOnly = true,
  serverPagination = false,
}: {
  client: CyberwaveClient;
  readOnly?: boolean;
  serverPagination?: boolean;
  workflow: Workflow;
  environmentId?: string;
  workspaceId?: string;
  onChange: (w: Workflow) => void;
  onCreated: (w: Workflow) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [inputContract, setInputContract] = useState<WorkflowInputContract>();
  const [contractStatus, setContractStatus] = useState(
    "Loading input definitions…",
  );
  const [contractReady, setContractReady] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    setInputContract(undefined);
    setContractReady(false);
    setContractStatus("Loading input definitions…");
    client.workflows
      .inputContract(workflow.uuid, { signal: abort.signal })
      .then((contract) => {
        if (!abort.signal.aborted) {
          setInputContract(contract);
          setContractReady(true);
          setContractStatus("");
        }
      })
      .catch((error) => {
        if (abort.signal.aborted) return;
        if (error instanceof CyberwaveError && error.status === 404) {
          setContractStatus(
            "This backend uses legacy input metadata; typed definitions are unavailable.",
          );
          setContractReady(true);
        } else setContractStatus(workflowError(error));
      });
    return () => abort.abort();
  }, [client, workflow]);
  const editable =
    !readOnly && contractReady && inputContract?.can_edit !== false;
  const executable = editable && inputContract?.can_execute !== false;
  const fields = workflowEditableFields(workflow, inputContract),
    schedules = workflowSchedules(workflow);
  const triggers = (workflow.nodes ?? []).filter(
    (n) => n.node_type === "trigger" && !n.is_disabled,
  );
  const configurable =
    triggers.length === 1 &&
    ["manual", "schedule"].includes(triggers[0].trigger_type ?? "");
  const timingEditable =
    configurable &&
    !(workflow.nodes ?? []).some((node) =>
      Object.values(
        (node.metadata.input_mappings ?? {}) as Record<
          string,
          { mode?: string }
        >,
      ).some((mapping) => !mapping || mapping.mode !== "value"),
    );
  const [name, setName] = useState(workflow.name + " · configured"),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const [values, setValues] = useState<Record<string, string>>({}),
    [dirty, setDirty] = useState(false),
    [timingDirty, setTimingDirty] = useState(false);
  const [mode, setMode] = useState<"manual" | "schedule">(
    triggers[0]?.trigger_type === "schedule" ? "schedule" : "manual",
  );
  const [cron, setCron] = useState(
    String(schedules[0]?.configuration.cron ?? "0 9 * * 1-5"),
  );
  const [timezone, setTimezone] = useState(
    String(schedules[0]?.configuration.timezone ?? "UTC"),
  );
  const [target, setTarget] = useState(workflow.execution_target),
    [twins, setTwins] = useState<Twin[]>([]);
  const [waypoints, setWaypoints] = useState<
    components["schemas"]["EnvironmentWaypointSchema"][]
  >([]);
  useEffect(() => {
    setValues(
      Object.fromEntries(
        workflowEditableFields(workflow).map((f) => [
          f.nodeId + ":" + f.name,
          workflowFieldText(f.value),
        ]),
      ),
    );
    setDirty(false);
    setTimingDirty(false);
    setTarget(workflow.execution_target);
    const entry = workflow.nodes?.find(
      (node) => node.node_type === "trigger" && !node.is_disabled,
    );
    const schedule = workflowSchedules(workflow).find(
      (row) => row.nodeId === entry?.uuid,
    );
    setMode(schedule ? "schedule" : "manual");
    setCron(
      String(schedule ? (schedule.configuration.cron ?? "") : "0 9 * * 1-5"),
    );
    setTimezone(String(schedule?.configuration.timezone ?? "UTC"));
  }, [workflow]);
  useEffect(() => {
    const abort = new AbortController();
    const env = workflow.is_template
      ? environmentId
      : workflow.environment_uuid;
    setTwins([]);
    setWaypoints([]);
    if (env)
      client.environments
        .waypoints(env, { signal: abort.signal })
        .then((items) => {
          if (!abort.signal.aborted) setWaypoints(items);
        })
        .catch(() => {});
    if (env)
      client.environments
        .twins(env, { signal: abort.signal })
        .then((items) => {
          if (!abort.signal.aborted) setTwins(items);
        })
        .catch(() => {});
    return () => abort.abort();
  }, [client, environmentId, workflow.environment_uuid, workflow.is_template]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    onBusyChange(true);
    setStatus("Working…");
    try {
      await fn();
    } catch (e) {
      setStatus(
        workflowError(e) + " Check the saved workflow before retrying.",
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  async function clone() {
    await action(async () => {
      const draft = await client.workflows.clone(workflow.uuid, {
        name,
        environment_uuid: environmentId,
        workspace_uuid: workspaceId,
      });
      // Clone persists a draft. Fetch the remapped graph before presenting target fields.
      onCreated(await client.workflows.get(draft.uuid));
      setStatus("Draft created. Configure it before activation.");
    });
  }
  async function save() {
    await action(async () => {
      const updates = workflowInputUpdates(workflow, values, fields);
      if (timingDirty && configurable) {
        if (mode === "schedule" && !cron.trim())
          throw new Error(
            "Enter a cron expression to change the schedule. Existing interval schedules stay unchanged until edited.",
          );
        const node = triggers[0];
        const existing = updates.find((update) => update.nodeId === node.uuid);
        const patch = existing?.patch ?? workflowNodePatch(node, [], {});
        const timing = {
          ...patch,
          trigger_type: mode,
          node_subtype: mode,
          ...(node.trigger_type !== mode
            ? { name: mode === "schedule" ? "Schedule" : "Manual" }
            : {}),
          parameters: {
            ...patch.parameters,
            ...(mode === "schedule"
              ? { mode: "advanced", cron, timezone }
              : {}),
          },
        };
        if (existing) existing.patch = timing;
        else updates.push({ nodeId: node.uuid, patch: timing });
      }
      // All validation above completes before the first request. Each update
      // keeps the backend's optimistic concurrency guard; no automatic retries.
      for (const { nodeId, patch } of updates)
        await client.workflows.updateNode(workflow.uuid, nodeId, patch);
      if (target !== workflow.execution_target)
        await client.workflows.update(workflow.uuid, {
          execution_target: target,
        });
      onChange(await client.workflows.get(workflow.uuid));
      setStatus(
        "Configuration saved. Activation validates the complete graph.",
      );
    });
  }
  async function start() {
    await action(async () => {
      if (!workflow.is_active) await client.workflows.activate(workflow.uuid);
      if (mode === "manual")
        await client.workflows.execute(workflow.uuid, {
          node_uuid: triggers[0].uuid,
        });
      onChange(await client.workflows.get(workflow.uuid));
      setStatus(
        mode === "schedule"
          ? "Schedule enabled. Execution is owned by the backend or edge runtime."
          : "Run requested. The monitor shows backend execution state.",
      );
    });
  }
  const targetChoices = (name: string) =>
    name === "twin_uuid"
      ? twins.map((t) => ({ id: t.uuid, name: t.name }))
      : waypoints;
  return (
    <section className="cw-workflows section-gap">
      <span className="studio-kicker">
        {workflow.is_template ? "TEMPLATE" : "CONFIGURED WORKFLOW"}
      </span>
      <h2>{workflow.name}</h2>
      <p>{workflow.description}</p>
      {contractStatus && (
        <p className="note" role="status">
          {contractStatus}
        </p>
      )}
      {readOnly && (
        <p className="note">
          Read-only view. Enable editing in the host application to configure
          workflows.
        </p>
      )}
      {workflow.is_template ? (
        <>
          <label className="field">
            Workflow name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button
            className="cw-button"
            disabled={
              readOnly ||
              busy ||
              !name.trim() ||
              (!environmentId && !workspaceId)
            }
            onClick={clone}
          >
            Create draft from template
          </button>
        </>
      ) : (
        <>
          <div className="comparison">
            {schedules.map((s) => (
              <article key={s.nodeId}>
                <h3>
                  {s.name} · {s.enabled ? "Enabled" : "Paused"}
                </h3>
                <p>
                  {String(
                    s.configuration.cron ??
                      `Every ${s.configuration.interval} ${s.configuration.unit}`,
                  )}{" "}
                  · {String(s.configuration.timezone ?? "UTC")}
                </p>
                {Boolean(s.configuration.active_while_twin_live_uuid) && (
                  <p>
                    Requires live twin:{" "}
                    {String(s.configuration.active_while_twin_live_uuid)}
                  </p>
                )}
              </article>
            ))}
          </div>
          <p className="compact muted">
            {workflow.run_on_edge ? "Edge runtime" : "Cloud runtime"} ·{" "}
            {workflow.execution_target}. These are saved node defaults.
            Reference, expression and caller bindings stay in the workflow
            editor.
          </p>
          {!fields.length && (
            <p className="note">
              This template has no declared static editable fields. Configure
              its graph in the Cyberwave editor.
            </p>
          )}
          <fieldset
            disabled={busy || workflow.is_active || !editable}
            className="workflow-fields"
          >
            <legend>Inputs & targets</legend>
            {fields.map((f) => (
              <label className="field" key={f.nodeId + ":" + f.name}>
                {f.nodeName} · {f.label ?? f.name}
                {f.required ? " *" : ""}
                {Boolean(f.description) && <small>{f.description}</small>}
                {f.options?.length ? (
                  <select
                    value={values[f.nodeId + ":" + f.name] ?? ""}
                    onChange={(e) => {
                      setValues({
                        ...values,
                        [f.nodeId + ":" + f.name]: e.target.value,
                      });
                      setDirty(true);
                    }}
                  >
                    {f.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (f.name === "twin_uuid" && twins.length) ||
                  (f.name === "waypoint_id" && waypoints.length) ? (
                  <select
                    value={values[f.nodeId + ":" + f.name] ?? ""}
                    onChange={(e) => {
                      setValues({
                        ...values,
                        [f.nodeId + ":" + f.name]: e.target.value,
                      });
                      setDirty(true);
                    }}
                  >
                    <option value="">Choose a target</option>
                    {values[f.nodeId + ":" + f.name] &&
                      !targetChoices(f.name).some(
                        (t) => t.id === values[f.nodeId + ":" + f.name],
                      ) && (
                        <option value={values[f.nodeId + ":" + f.name]}>
                          Current target: {values[f.nodeId + ":" + f.name]}
                        </option>
                      )}
                    {targetChoices(f.name).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={values[f.nodeId + ":" + f.name] ?? ""}
                    onChange={(e) => {
                      setValues({
                        ...values,
                        [f.nodeId + ":" + f.name]: e.target.value,
                      });
                      setDirty(true);
                    }}
                  />
                )}
              </label>
            ))}
            {configurable ? (
              <>
                <label className="field">
                  Execution mode
                  <select
                    value={target}
                    onChange={(e) => {
                      setTarget(e.target.value);
                      setDirty(true);
                    }}
                  >
                    <option value="simulation">Simulation</option>
                    <option value="live">Live</option>
                  </select>
                </label>
                {!timingEditable && (
                  <p className="compact muted">
                    This graph uses dynamic input bindings. Change its trigger
                    in the workflow editor so those bindings can be reviewed.
                  </p>
                )}
                {target === "simulation" && (
                  <p className="compact muted">
                    The backend checks that this environment supports simulation
                    before executing.
                  </p>
                )}
                <label className="field">
                  When
                  <select
                    disabled={!timingEditable}
                    value={mode}
                    onChange={(e) => {
                      setMode(e.target.value as typeof mode);
                      setTimingDirty(true);
                      setDirty(true);
                    }}
                  >
                    <option value="manual">Run on request</option>
                    <option value="schedule">Recurring schedule</option>
                  </select>
                </label>
                {mode === "schedule" && (
                  <>
                    <label className="field">
                      Schedule preset
                      <select
                        value={
                          ["*/5 * * * *", "0 * * * *", "0 9 * * 1-5"].includes(
                            cron,
                          )
                            ? cron
                            : "custom"
                        }
                        onChange={(e) => {
                          if (e.target.value !== "custom") {
                            setCron(e.target.value);
                            setTimingDirty(true);
                            setDirty(true);
                          }
                        }}
                      >
                        <option value="custom">Custom cron</option>
                        <option value="*/5 * * * *">Every 5 minutes</option>
                        <option value="0 * * * *">Hourly</option>
                        <option value="0 9 * * 1-5">Weekdays at 09:00</option>
                      </select>
                    </label>
                    <label className="field">
                      Cron expression
                      <input
                        value={cron}
                        onChange={(e) => {
                          setCron(e.target.value);
                          setTimingDirty(true);
                          setDirty(true);
                        }}
                      />
                    </label>
                    <label className="field">
                      Timezone
                      <input
                        value={timezone}
                        onChange={(e) => {
                          setTimezone(e.target.value);
                          setTimingDirty(true);
                          setDirty(true);
                        }}
                      />
                    </label>
                    <p className="compact muted">
                      Example: 0 9 * * 1-5 = weekdays at 09:00. Five fields, or
                      six with seconds first. This repeats; it is not a one-off
                      run.
                    </p>
                  </>
                )}
              </>
            ) : (
              <p>
                Use the editor to configure workflows with event triggers or
                multiple entry points.
              </p>
            )}
            <button className="cw-button" disabled={!dirty} onClick={save}>
              Save configuration
            </button>
          </fieldset>
          <div className="toolbar">
            <button
              className="cw-button"
              disabled={
                !editable ||
                busy ||
                dirty ||
                !configurable ||
                (mode === "schedule" && workflow.is_active)
              }
              onClick={start}
            >
              {mode === "schedule" ? "Enable schedule" : "Run now"}
            </button>
            <button
              className="cw-button"
              disabled={!editable || busy || !workflow.is_active}
              onClick={() =>
                action(async () => {
                  await client.workflows.deactivate(workflow.uuid);
                  onChange(await client.workflows.get(workflow.uuid));
                  setStatus(
                    "Workflow paused. Existing executions may still need cancellation.",
                  );
                })
              }
            >
              Pause workflow
            </button>
            <button
              className="cw-button"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  onChange(await client.workflows.get(workflow.uuid));
                  setStatus("Reloaded saved configuration.");
                })
              }
            >
              Reload configuration
            </button>
          </div>
          <WorkflowMonitor
            readOnly={!executable}
            serverPagination={serverPagination}
            key={workflow.updated_at}
            client={client}
            workflow={workflow}
          />
        </>
      )}
      <p className="status-line" role="status">
        {status}
      </p>
    </section>
  );
}
