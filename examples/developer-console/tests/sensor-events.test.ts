import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { streamSensorEvents } from "../sensor-events.mjs";
const session = { origin: "http://localhost:8008", token: "test-only" };
const settings = {
  localOrigin: session.origin,
  mqttUsername: "test",
  mqttPassword: "test",
};
const url = new URL(
  "http://localhost/gateway/sensor-events?twin=robot&sensor=depth&channel=depth",
);
const api = async () =>
  Response.json({
    capabilities: { sensors: [{ id: "depth", type: "depth" }] },
  });
test("local telemetry bridge checks API scope before opening a broker", async () => {
  for (const [candidate, fetcher] of [
    [{ ...session, origin: "https://api.cyberwave.com" }, api],
    [session, async () => Response.json({}, { status: 403 })],
  ] as const) {
    await assert.rejects(
      streamSensorEvents(
        {},
        new EventEmitter(),
        url,
        candidate,
        () => true,
        settings,
        fetcher,
        async () => assert.fail("Unauthorized broker access"),
      ),
    );
  }
});
test("bridge filters exact sensor identity and releases the broker on API retarget", async () => {
  let current = true,
    closed = 0;
  const lines: string[] = [];
  const broker = Object.assign(new EventEmitter(), {
    subscribeAsync: async (topic: string) => {
      assert.equal(topic, "localcyberwave/twin/robot/depth");
      return [{ qos: 0 }];
    },
    endAsync: async () => {
      closed++;
    },
  });
  const response = Object.assign(new EventEmitter(), {
    headersSent: false,
    writableNeedDrain: false,
    writeHead() {
      this.headersSent = true;
    },
    write(value: string) {
      lines.push(value);
    },
    end() {
      this.emit("close");
    },
  });
  await streamSensorEvents(
    {},
    response,
    url,
    session,
    () => current,
    settings,
    api,
    async () => broker,
  );
  const emit = (value: unknown) =>
    broker.emit(
      "message",
      "localcyberwave/twin/robot/depth",
      Buffer.from(JSON.stringify(value)),
    );
  emit({ type: "depth_data", data: { sensor_id: "other" } });
  emit({ type: "depth_data", data: { sensor_id: "depth", width: 160 } });
  assert.equal(lines.filter((line) => line.trim()).length, 1);
  current = false;
  emit({ sensor_id: "depth" });
  assert.equal(closed, 1);
  assert.equal(lines.filter((line) => line.trim()).length, 1);
});

test("a browser disconnect during authorization never opens a broker", async () => {
  const response = { destroyed: false };
  await streamSensorEvents(
    {},
    response,
    url,
    session,
    () => true,
    settings,
    async () => {
      response.destroyed = true;
      return api();
    },
    async () => assert.fail("No broker for a disconnected browser"),
  );
});
