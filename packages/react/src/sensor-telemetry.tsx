"use client";
import { useMemo, useState } from "react";
import type { TwinTelemetryQuery } from "cyberwave";
import { useCyberwave } from "./index.js";
import { useResource, useResourceKey } from "./resource.js";

/** Explicit time window, pagination and refresh; no hidden background polling. */
export function useSensorTelemetry(
  twinUuid: string,
  sensorId: string,
  query: Omit<TwinTelemetryQuery, "sensor_id">,
  refreshKey = 0,
) {
  const client = useCyberwave();
  const { start, end, event_types, limit, offset, order } = query;
  return useResource(
    useMemo(
      () => (signal: AbortSignal) =>
        client.twins.telemetry(
          twinUuid,
          {
            start,
            end,
            event_types,
            limit,
            offset,
            order,
            sensor_id: sensorId,
          },
          { signal },
        ),
      [
        client,
        twinUuid,
        sensorId,
        start,
        end,
        event_types,
        limit,
        offset,
        order,
        refreshKey,
      ],
    ),
  );
}
export function SensorTelemetryPanel({
  twinUuid,
  sensorId,
  start,
  end,
}: {
  twinUuid: string;
  sensorId: string;
  start: string;
  end: string;
}) {
  const key = useResourceKey(useCyberwave(), twinUuid, sensorId, start, end);
  return <TelemetryPage key={key} {...{ twinUuid, sensorId, start, end }} />;
}
function TelemetryPage({
  twinUuid,
  sensorId,
  start,
  end,
}: {
  twinUuid: string;
  sensorId: string;
  start: string;
  end: string;
}) {
  const [offset, setOffset] = useState(0),
    [refresh, setRefresh] = useState(0);
  const state = useSensorTelemetry(
    twinUuid,
    sensorId,
    { start, end, limit: 20, offset, order: "desc" },
    refresh,
  );
  return (
    <section className="cw-browser" aria-label="Stored sensor telemetry">
      <p>
        Stored telemetry · sensor <strong>{sensorId}</strong>
      </p>
      {state.loading && <p role="status">Loading sensor samples…</p>}
      {state.error && (
        <p role="alert" className="cw-error">
          {state.error.message}
        </p>
      )}
      {state.data && (
        <p>{state.data.total} matching samples in this time window.</p>
      )}
      {state.data?.items.length === 0 && (
        <p>
          No persisted samples for this sensor and time window. Live packets may
          not be stored.
        </p>
      )}
      {state.data?.items.map((row) => (
        <details key={row.uuid} className="cw-telemetry-row">
          <summary>
            <time dateTime={row.timestamp}>{row.timestamp}</time> ·{" "}
            {row.event_type}
          </summary>
          <pre className="cw-telemetry-data">
            {JSON.stringify(row.metadata, null, 2)}
          </pre>
        </details>
      ))}
      <div className="cw-pagination">
        <button
          className="cw-button"
          disabled={!offset || state.loading}
          onClick={() => setOffset(Math.max(0, offset - 20))}
        >
          Newer
        </button>
        <button
          className="cw-button"
          disabled={!state.data?.has_more || state.loading}
          onClick={() => setOffset(offset + 20)}
        >
          Older
        </button>
        <button
          className="cw-button"
          disabled={state.loading}
          onClick={() => {
            setOffset(0);
            setRefresh(refresh + 1);
          }}
        >
          Refresh window
        </button>
      </div>
    </section>
  );
}
