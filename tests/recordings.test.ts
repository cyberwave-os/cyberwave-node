import test from "node:test";
import assert from "node:assert/strict";
import {
  createCyberwave,
  recordingWindow,
  recordingVideos,
  mediaSecondsToTimestampUs,
} from "../dist/index.js";
const start = 1_780_000_000_000_000;
test("recording catalog retains pagination and repeated context filters", async () => {
  let url = "";
  const client = createCyberwave({
    fetch: async (req) => {
      url = (req as Request).url;
      return Response.json({
        items: [],
        has_more: true,
        next_cursor: "next-page",
      });
    },
  });
  const page = await client.recordings.list("env", {
    cursor: "first",
    context: ["live", "simulation"],
    limit: 12,
  });
  assert.equal(page.next_cursor, "next-page");
  assert.deepEqual(new URL(url).searchParams.getAll("context"), [
    "live",
    "simulation",
  ]);
});
test("playback distinguishes materialization from playable sources", async () => {
  let pending = true;
  const client = createCyberwave({
    fetch: async () =>
      pending
        ? Response.json(
            {
              detail: "Preparing media",
              playback_readiness: { state: "pending" },
              retry_after_seconds: 5,
            },
            { status: 202 },
          )
        : Response.json({
            items: {
              twin_data: {},
              twin_uuids: [],
              is_combined: false,
              start_timestamp_us: start,
              end_timestamp_us: start + 1e6,
            },
          }),
  });
  const result = await client.recordings.playback("env", "recording");
  assert.equal(result.status, "materializing");
  if (result.status === "materializing")
    assert.equal(result.retryAfterSeconds, 5);
  pending = false;
  assert.equal(
    (await client.recordings.playback("env", "recording")).status,
    "ready",
  );
});
test("clock uses explicit microseconds, rejects unsafe or reversed windows", () => {
  assert.equal(
    recordingWindow({ start_timestamp: start, end_timestamp: start + 3e6 })
      ?.durationSeconds,
    3,
  );
  assert.equal(
    recordingWindow({ start_timestamp_us: start, end_timestamp_us: start - 1 }),
    null,
  );
  assert.equal(
    recordingWindow({
      start_timestamp_us: Infinity,
      end_timestamp_us: Infinity,
    }),
    null,
  );
  assert.equal(
    mediaSecondsToTimestampUs({ startUs: start, endUs: start + 3e6 }, 10),
    start + 3e6,
  );
  assert.throws(() =>
    mediaSecondsToTimestampUs({ startUs: start, endUs: start + 3e6 }, NaN),
  );
});
test("video extraction uses camera clock and declines chunked, unsafe or unknown sources", () => {
  const camera = {
    format: "mp4",
    signed_url: "https://storage.example.com/movie.mp4?signature=temporary",
    first_timestamp_us: start,
    last_timestamp_us: start + 3e6,
  };
  const sources = {
    is_combined: true,
    twin_uuids: ["a", "b", "c", "d"],
    start_timestamp_us: start,
    end_timestamp_us: start + 3e6,
    twin_data: {
      a: { camera },
      b: { camera: { ...camera, format: "mkv", videos: [] } },
      c: { camera: { ...camera, signed_url: "javascript:bad" } },
      d: { camera: { ...camera, first_timestamp_us: undefined } },
    },
  };
  const videos = recordingVideos(sources);
  assert.equal(videos.length, 1);
  assert.equal(videos[0].twinUuid, "a");
  assert.equal(videos[0].startUs, start);
});
test("mission helper reads definitions without creating or executing them", async () => {
  let request: Request;
  const client = createCyberwave({
    fetch: async (input) => {
      request = input as Request;
      return Response.json([]);
    },
  });
  await client.missions.list("robot");
  assert.equal(request!.method, "GET");
  assert.equal(new URL(request!.url).pathname, "/api/v1/twins/robot/missions");
});
