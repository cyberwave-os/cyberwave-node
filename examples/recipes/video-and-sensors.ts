import {
  type CyberwaveClient,
  type SensorTelemetryTransport,
  subscribeSensorTelemetry,
  twinSensors,
} from "cyberwave";
import { connectVideo, type VideoTarget } from "cyberwave/video";

export async function discoverSensors(
  client: CyberwaveClient,
  twinUuid: string,
  signal: AbortSignal,
) {
  return twinSensors(await client.twins.get(twinUuid, { signal }));
}
/** The host owns auth, DOM, deployment configuration and explicit Stop controls. */
export async function watchSensor(
  client: CyberwaveClient,
  target: VideoTarget,
  video: HTMLVideoElement,
  rtcConfiguration: RTCConfiguration,
  signal: AbortSignal,
) {
  const viewer = await connectVideo(client, target, {
    rtcConfiguration,
    signal,
  });
  video.srcObject = viewer.stream;
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  const detach = () => {
    video.srcObject = null;
  };
  signal.addEventListener("abort", detach, { once: true });
  if (signal.aborted) detach();
  return async () => {
    signal.removeEventListener("abort", detach);
    detach();
    await viewer.close();
  };
}
export async function readSensorWindow(
  client: CyberwaveClient,
  twinUuid: string,
  sensorId: string,
  start: string,
  end: string,
  signal: AbortSignal,
) {
  return client.twins.telemetry(
    twinUuid,
    { sensor_id: sensorId, start, end, limit: 20, order: "desc" },
    { signal },
  );
}
export function watchImu(
  transport: SensorTelemetryTransport,
  twinUuid: string,
  sensorId: string,
  topicPrefix: string,
  render: (payload: Record<string, unknown>) => void,
  signal: AbortSignal,
) {
  return subscribeSensorTelemetry(
    transport,
    { twinUuid, sensorId, channel: "imu", topicPrefix },
    (sample) => render(sample.payload),
    signal,
  );
}
