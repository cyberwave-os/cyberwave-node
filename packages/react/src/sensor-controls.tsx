"use client";
import { useEffect, useMemo, useState } from "react";
import {
  twinSensors,
  subscribeSensorTelemetry,
  type Twin,
  type SensorTelemetrySample,
  type SensorTelemetryTransport,
} from "cyberwave";
import { useCyberwave } from "./index.js";
import { useResourceKey } from "./resource.js";

/** Controlled catalog picker. Sensor capabilities remain backend-owned. */
export function SensorSelector({
  twin,
  value,
  onChange,
  videoOnly = false,
}: {
  twin: Pick<Twin, "capabilities">;
  value: string;
  onChange: (id: string) => void;
  videoOnly?: boolean;
}) {
  const sensors = twinSensors(twin).filter(
    (sensor) => !videoOnly || ["rgb", "depth"].includes(sensor.type),
  );
  return (
    <label className="cw-sensor-selector">
      Sensor
      <select
        value={sensors.some((s) => s.id === value) ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">
          {sensors.length ? "Select a sensor" : "No compatible sensors"}
        </option>
        {sensors.map((sensor) => (
          <option key={sensor.id} value={sensor.id}>
            {sensor.name} · {sensor.type}
          </option>
        ))}
      </select>
    </label>
  );
}

type LiveOptions = {
  transport: SensorTelemetryTransport;
  twinUuid: string;
  sensorId: string;
  channel: string;
  topicPrefix?: string;
  enabled?: boolean;
};
/** Latest sample only, at most ten UI updates per second. No unbounded message history. */
export function useLiveSensorTelemetry({
  transport,
  twinUuid,
  sensorId,
  channel,
  topicPrefix,
  enabled = true,
}: LiveOptions) {
  const client = useCyberwave();
  const scope = useMemo(
    () => ({
      transport,
      twinUuid,
      sensorId,
      channel,
      topicPrefix,
      enabled,
      client,
    }),
    [transport, twinUuid, sensorId, channel, topicPrefix, enabled, client],
  );
  const [state, setState] = useState<{
    scope?: typeof scope;
    sample?: SensorTelemetrySample;
    count: number;
    status: string;
    error?: Error;
  }>({ count: 0, status: "idle" });
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    let latest: SensorTelemetrySample | undefined,
      count = 0,
      rendered = 0;
    setState({ scope, count, status: "connecting" });
    const timer = setInterval(() => {
      if (count === rendered) return;
      rendered = count;
      setState({ scope, count, sample: latest, status: "receiving" });
    }, 100);
    subscribeSensorTelemetry(
      transport,
      scope,
      (sample) => {
        latest = sample;
        count++;
      },
      abort.signal,
    ).then(
      () => {
        if (!abort.signal.aborted)
          setState({
            scope,
            count,
            sample: latest,
            status: count ? "receiving" : "waiting",
          });
      },
      (error) => {
        if (!abort.signal.aborted) {
          clearInterval(timer);
          setState({ scope, count, status: "error", error });
        }
      },
    );
    return () => {
      abort.abort();
      clearInterval(timer);
    };
  }, [scope, enabled, transport]);
  return state.scope === scope
    ? state
    : { count: 0, status: enabled ? "connecting" : "paused" };
}

export function LiveSensorTelemetryPanel(
  props: LiveOptions & { staleAfterMs?: number },
) {
  const key = useResourceKey(
    useCyberwave(),
    props.transport,
    props.twinUuid,
    props.sensorId,
    props.channel,
    props.topicPrefix,
    props.enabled,
  );
  return <LivePanel key={key} {...props} />;
}
function LivePanel({
  staleAfterMs = 5000,
  ...props
}: LiveOptions & { staleAfterMs?: number }) {
  const [paused, setPaused] = useState(false),
    [now, setNow] = useState(Date.now());
  const state = useLiveSensorTelemetry({
    ...props,
    enabled: props.enabled !== false && !paused,
  });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const age = state.sample
    ? Math.max(0, now - state.sample.receivedAt)
    : undefined;
  return (
    <section className="cw-browser" aria-label="Live sensor telemetry">
      <div className="cw-sensor-heading">
        <h3>Live sensor telemetry</h3>
        <button
          type="button"
          className="cw-button"
          disabled={props.enabled === false}
          onClick={() => setPaused(!paused)}
        >
          {paused ? "Resume telemetry" : "Pause telemetry"}
        </button>
      </div>
      <p role="status">
        {state.status}
        {age !== undefined &&
          ` · ${age >= staleAfterMs ? "stale · " : ""}${Math.floor(age / 1000)}s since last sample`}{" "}
        · {state.count} samples
      </p>
      <p className="cw-muted">
        {props.sensorId} · {props.channel}. Arrival time, not a synchronized
        camera clock.
      </p>
      {state.error && (
        <p role="alert" className="cw-error">
          {state.error.message}
        </p>
      )}
      {state.status === "paused" && <p>Telemetry is paused.</p>}
      {!state.sample && !state.error && state.status !== "paused" && (
        <p>
          Waiting for this sensor to publish. Other sensors and unidentified
          packets are excluded.
        </p>
      )}
      {state.sample && (
        <details open>
          <summary>Latest sample</summary>
          <pre className="cw-telemetry-data">
            {JSON.stringify(
              state.sample.payload,
              (_key, value) =>
                typeof value === "string" && value.length > 240
                  ? `[${value.length} characters; binary data omitted from preview]`
                  : Array.isArray(value) && value.length > 32
                    ? [
                        ...value.slice(0, 32),
                        `[${value.length - 32} more items]`,
                      ]
                    : value,
              2,
            )}
          </pre>
        </details>
      )}
    </section>
  );
}
