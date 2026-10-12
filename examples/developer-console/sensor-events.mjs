import { connectAsync } from "mqtt";
import { sensorSampleId, twinSensors } from "cyberwave";

/** Local example bridge: exact read-only topic, API ACL, bounded lifetime and no browser credentials. */
export async function streamSensorEvents(
  req,
  res,
  url,
  session,
  isCurrent,
  settings,
  transport = fetch,
  connectBroker = connectAsync,
) {
  if (session.origin !== settings.localOrigin || !session.token)
    throw Object.assign(
      new Error("Live telemetry requires the authenticated local API."),
      { status: 403 },
    );
  const twinUuid = url.searchParams.get("twin"),
    sensorId = url.searchParams.get("sensor"),
    channel = url.searchParams.get("channel");
  if (
    !/^[a-zA-Z0-9-]+$/.test(twinUuid || "") ||
    !sensorId ||
    !["imu", "depth", "lidar", "pointcloud", "telemetry"].includes(channel)
  )
    throw Object.assign(
      new Error("Select one twin, sensor and supported telemetry channel."),
      { status: 400 },
    );
  async function authorize() {
    if (!isCurrent()) throw new Error("API connection changed or expired.");
    const response = await transport(
      new URL(`/api/v1/twins/${twinUuid}`, session.origin),
      {
        headers: { Authorization: `Bearer ${session.token}` },
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      },
    );
    if (!response.ok)
      throw Object.assign(new Error("Sensor read access was denied."), {
        status: response.status,
      });
    if (!twinSensors(await response.json()).some((s) => s.id === sensorId))
      throw Object.assign(
        new Error("Sensor is not in the twin capabilities."),
        { status: 404 },
      );
  }
  await authorize();
  if (res.destroyed) return;
  const mqttUrl = settings.mqttUrl || "mqtt://127.0.0.1:1883";
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(mqttUrl).hostname))
    throw new Error("This example bridge requires a local broker.");
  const prefix = settings.mqttPrefix || "local";
  if (!/^[a-zA-Z0-9_-]*$/.test(prefix))
    throw new Error("Invalid broker prefix.");
  const topic = `${prefix}cyberwave/twin/${twinUuid}/${channel}`;
  let broker,
    closed = false,
    timer,
    limit;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    clearTimeout(limit);
    if (broker) void broker.endAsync(true);
    res.end();
  };
  res.once("close", close);
  try {
    broker = await connectBroker(mqttUrl, {
      username: settings.mqttUsername,
      password: settings.mqttPassword,
      reconnectPeriod: 0,
      connectTimeout: 3000,
      clean: true,
    });
    if (closed) {
      await broker.endAsync(true);
      return;
    }
    broker.on("error", close);
    broker.on("offline", close);
    const grants = await broker.subscribeAsync(topic, { qos: 0 });
    if (grants.some((g) => g.qos === 128))
      throw new Error("Broker denied subscription.");
    if (closed) return;
    res.writeHead(200, {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    });
    res.write("\n");
    broker.on("message", (incoming, bytes) => {
      if (closed || incoming !== topic || bytes.length > 1024 * 1024) return;
      if (!isCurrent()) return close();
      try {
        const payload = JSON.parse(bytes.toString());
        if (
          payload &&
          typeof payload === "object" &&
          sensorSampleId(payload) === sensorId
        ) {
          // Drop on backpressure: retaining old live samples is worse than skipping them.
          if (!res.writableNeedDrain) res.write(`${JSON.stringify(payload)}\n`);
        }
      } catch {
        /* Non-JSON/binary channels need a dedicated decoder. */
      }
    });
    let checking = false;
    timer = setInterval(() => {
      if (checking) return;
      checking = true;
      authorize()
        .then(() => {
          if (!closed) res.write("\n");
        }, close)
        .finally(() => {
          checking = false;
        });
    }, 5000);
    limit = setTimeout(close, 5 * 60 * 1000);
  } catch (error) {
    if (res.headersSent) {
      close();
      return;
    }
    closed = true;
    clearInterval(timer);
    clearTimeout(limit);
    res.removeListener("close", close);
    if (broker) await broker.endAsync(true);
    throw error;
  }
}
