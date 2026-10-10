import test from "node:test";
import assert from "node:assert/strict";
import {
  createCyberwave,
  subscribeSensorTelemetry,
  twinSensors,
} from "../dist/index.js";

test("sensor discovery uses the resolved backend catalog", () => {
  assert.deepEqual(
    twinSensors({
      capabilities: {
        sensors: [
          { id: "front", name: "Front camera", type: "rgb_camera" },
          null,
          { id: "", type: "imu" },
        ],
      },
    }),
    [{ id: "front", name: "Front camera", type: "rgb_camera" }],
  );
  assert.deepEqual(twinSensors({ capabilities: {} }), []);
});
test("history sends its sensor filter to the server and refuses mixed results from older backends", async () => {
  let mixed = false;
  const client = createCyberwave({
    fetch: async (request) => {
      const url = new URL((request as Request).url);
      assert.equal(url.pathname, "/api/v1/twins/robot/telemetry");
      assert.equal(url.searchParams.get("sensor_id"), "front");
      assert.equal(url.searchParams.get("limit"), "2");
      return Response.json({
        items: [{ metadata: { sensor_id: mixed ? "rear" : "front" } }],
        total: 1,
        has_more: false,
      });
    },
  });
  await client.twins.telemetry("robot", { sensor_id: "front", limit: 2 });
  mixed = true;
  await assert.rejects(
    client.twins.telemetry("robot", { sensor_id: "front", limit: 2 }),
    /did not apply the sensor filter/,
  );
});
test("live subscription excludes unlabeled and other sensor packets and cleans up once", async () => {
  let receive!: (value: unknown) => void,
    closed = 0;
  const samples: unknown[] = [],
    abort = new AbortController();
  const stop = await subscribeSensorTelemetry(
    {
      subscribe: async (topic, handler) => {
        assert.equal(topic, "localcyberwave/twin/robot/imu");
        receive = handler;
        return () => {
          closed++;
        };
      },
    },
    {
      twinUuid: "robot",
      sensorId: "front",
      channel: "imu",
      topicPrefix: "local",
    },
    (sample) => samples.push(sample.payload),
    abort.signal,
  );
  for (const value of [
    null,
    [],
    "bad",
    {},
    { sensor_id: "rear" },
    { sensor_id: "front", acceleration: [0, 0, 9.8] },
  ])
    receive(value);
  assert.equal(samples.length, 1);
  abort.abort();
  stop();
  receive({ sensor_id: "front" });
  assert.equal(closed, 1);
  assert.equal(samples.length, 1);
});
test("an aborted pending subscription releases the eventual subscription", async () => {
  let complete!: (stop: () => void) => void,
    closed = 0;
  const abort = new AbortController();
  const pending = subscribeSensorTelemetry(
    {
      subscribe: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    },
    { twinUuid: "robot", sensorId: "front", channel: "imu" },
    () => assert.fail("late data"),
    abort.signal,
  );
  abort.abort();
  complete(() => {
    closed++;
  });
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(closed, 1);
});
test("live subscriptions reject wildcard channels before touching the transport", async () => {
  for (const channel of ["#", "imu/+", "/imu", "imu/"])
    await assert.rejects(
      subscribeSensorTelemetry(
        {
          subscribe: async () => {
            assert.fail("invalid topic subscribed");
          },
        },
        { twinUuid: "robot", sensorId: "front", channel },
        () => {},
      ),
      /exact twin/,
    );
});
