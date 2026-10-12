import type { Twin } from "./index.js";

export type TwinSensor = { id: string; type: string; name: string };
/** The backend already resolves schema inheritance and legacy sensor aliases. */
export function twinSensors(twin: Pick<Twin, "capabilities">): TwinSensor[] {
  const sensors = twin.capabilities?.sensors;
  if (!Array.isArray(sensors)) return [];
  return sensors.flatMap((sensor) => {
    if (!sensor || typeof sensor !== "object") return [];
    const id = sensor.id || sensor.name;
    if (typeof id !== "string" || !id || typeof sensor.type !== "string")
      return [];
    return [
      {
        id,
        type: sensor.type,
        name: typeof sensor.name === "string" ? sensor.name : id,
      },
    ];
  });
}

export type SensorTelemetrySample = {
  topic: string;
  receivedAt: number;
  payload: Record<string, unknown>;
};
/** Supply an authenticated, application-owned subscription (for example MQTT.js). */
export type SensorTelemetryTransport = {
  subscribe: (
    topic: string,
    onMessage: (payload: unknown) => void,
  ) => Promise<() => void>;
};

/** Both names are used by existing producers; conflicting identities fail closed. */
export function sensorSampleId(
  sample: Record<string, unknown>,
): string | undefined {
  const nested =
    sample.type === "depth_data" &&
    sample.data &&
    typeof sample.data === "object"
      ? (sample.data as Record<string, unknown>).sensor_id
      : undefined;
  const id = sample.sensor_id ?? nested,
    alias = sample.sensor;
  if (
    sample.sensor_id !== undefined &&
    nested !== undefined &&
    sample.sensor_id !== nested
  )
    return undefined;
  if (id !== undefined && alias !== undefined && id !== alias) return undefined;
  const value = id ?? alias;
  return typeof value === "string" ? value : undefined;
}

/** Subscribe to one exact channel and reject unidentified or other-sensor samples. */
export async function subscribeSensorTelemetry(
  transport: SensorTelemetryTransport,
  target: {
    twinUuid: string;
    sensorId: string;
    channel: string;
    topicPrefix?: string;
  },
  onSample: (sample: SensorTelemetrySample) => void,
  signal?: AbortSignal,
): Promise<() => void> {
  const { twinUuid, sensorId, channel, topicPrefix = "" } = target;
  if (
    !twinUuid ||
    /[\/+#\0]/.test(twinUuid) ||
    !sensorId.trim() ||
    new TextEncoder().encode(sensorId).length > 128 ||
    !channel ||
    /[+#\0]/.test(channel) ||
    channel.startsWith("/") ||
    channel.endsWith("/") ||
    /[\/+#\0]/.test(topicPrefix)
  )
    throw new Error(
      "Use an exact twin, sensor and channel; MQTT wildcards are not supported.",
    );
  signal?.throwIfAborted();
  const topic = `${topicPrefix === "production" ? "" : topicPrefix}cyberwave/twin/${twinUuid}/${channel}`;
  let disposed = false;
  const unsubscribe = await transport.subscribe(topic, (payload) => {
    if (
      disposed ||
      signal?.aborted ||
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    )
      return;
    const sample = payload as Record<string, unknown>;
    if (sensorSampleId(sample) === sensorId)
      onSample({ topic, receivedAt: Date.now(), payload: sample });
  });
  const close = () => {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener("abort", close);
    unsubscribe();
  };
  signal?.addEventListener("abort", close, { once: true });
  if (signal?.aborted) {
    close();
    signal.throwIfAborted();
  }
  return close;
}
