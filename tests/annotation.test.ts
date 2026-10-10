import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCyberwave } from "../dist/index.js";
import {
  imageMarks,
  modelBoxProposals,
  loadImageModelTasks,
} from "../packages/react/dist/annotation/model.js";
import {
  fromImageAnnotations,
  toImageAnnotations,
} from "../packages/react/dist/annotation/geometry.js";
import { captureVideoFrame } from "../packages/react/dist/annotation/capture.js";
// Exported from the backend's canonical registry, not a provider-specific test parser.
const actions = JSON.parse(
  readFileSync(
    new URL("./fixtures/image-actions.json", import.meta.url),
    "utf8",
  ),
);
const boxes = {
  status: "completed",
  output_format: "boxes",
  structured_task: "detect_boxes",
  output: [{ label: "part", box_2d: [100, 200, 800, 900] }],
};
test("canonical YX coordinates become normalized XY proposals using catalog scale", () => {
  assert.deepEqual(modelBoxProposals(actions.detect_boxes, boxes), [
    { label: "part", bbox: [0.2, 0.1, 0.9, 0.8] },
  ]);
  const custom = {
    ...actions.detect_boxes,
    image_annotation: {
      ...actions.detect_boxes.image_annotation,
      coordinate_scale: 100,
    },
  };
  assert.deepEqual(
    imageMarks(custom, {
      ...boxes,
      output: [{ label: "part", box_2d: [10, 20, 80, 90] }],
    })[0].bbox,
    [0.2, 0.1, 0.9, 0.8],
  );
});
test("provider text, bad geometry, queued jobs, mismatched tasks and unknown contracts fail closed", () => {
  for (const result of [
    { ...boxes, output: "```json []```" },
    { ...boxes, status: "queued" },
    { ...boxes, structured_task: "segment" },
    ...[
      [10, 20, 0, 30],
      [0, 0, Infinity, 100],
      [0, 0, 1, 1001],
    ].map((box_2d) => ({ ...boxes, output: [{ label: "part", box_2d }] })),
  ])
    assert.throws(() => imageMarks(actions.detect_boxes, result));
  assert.throws(() =>
    imageMarks(
      {
        ...actions.detect_boxes,
        image_annotation: {
          ...actions.detect_boxes.image_annotation,
          version: 2,
        },
      },
      boxes,
    ),
  );
  assert.throws(() =>
    imageMarks({ ...actions.detect_boxes, image_annotation: null }, boxes),
  );
});
test("masks remain masks and never become dataset bounding-box proposals", () => {
  const result = {
    status: "completed",
    output_format: "masks",
    output: [
      {
        label: "part",
        box_2d: [100, 200, 800, 900],
        mask: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
      },
    ],
  };
  assert.match(
    imageMarks(actions.segment, result)[0].mask!,
    /^data:image\/png;base64,/,
  );
  assert.throws(() => modelBoxProposals(actions.segment, result), /Only box/);
  assert.throws(() =>
    imageMarks(actions.segment, {
      ...result,
      output: [
        { ...result.output[0], mask: "https://unrelated.example/mask.png" },
      ],
    }),
  );
});
test("points and image trajectories preserve ordered positions without robot command conversion", () => {
  for (const id of ["detect_points", "point_trajectory"])
    assert.deepEqual(
      imageMarks(actions[id], {
        status: "completed",
        output_format: actions[id].output_format,
        output: [
          { label: "a", point: [100, 200] },
          { label: "b", point: [300, 400] },
        ],
      }).map((m) => m.point),
      [
        [0.2, 0.1],
        [0.4, 0.3],
      ],
    );
});
test("editor rectangle and polygon roundtrip uses original pixel dimensions", () => {
  const values = [
    {
      label: "part",
      bbox: [0.1, 0.2, 0.9, 0.8],
      polygon: [
        [0.1, 0.2],
        [0.9, 0.3],
        [0.4, 0.8],
      ],
    },
    { label: "box", bbox: [0, 0, 1, 1] },
  ];
  const geometry = toImageAnnotations(values, 640, 480);
  assert.deepEqual(geometry[0].target.selector.geometry.points, [
    [64, 96],
    [576, 144],
    [256, 384],
  ]);
  assert.deepEqual(fromImageAnnotations(geometry, 640, 480), values);
  assert.throws(() => fromImageAnnotations(geometry, 0, 0));
  const bad = toImageAnnotations(
    [
      {
        label: "bad",
        bbox: [0, 0, 1, 1],
        polygon: [
          [0, 0],
          [0.5, 0.5],
          [1, 1],
        ],
      },
    ],
    640,
    480,
  );
  assert.throws(() => fromImageAnnotations(bad, 640, 480), /non-zero/);
  assert.throws(
    () =>
      fromImageAnnotations(
        toImageAnnotations([{ label: "bad", bbox: [0, 0, 2, 1] }], 640, 480),
        640,
        480,
      ),
    /inside/,
  );
});
test("task availability is intersected with model capabilities without an SDK task list", async () => {
  const calls: string[] = [];
  const client = createCyberwave({
    baseUrl: "http://localhost:8008",
    fetch: async (req) => {
      const path = new URL(req.url).pathname;
      calls.push(path);
      return Response.json(
        path.endsWith("structured-actions")
          ? { actions: Object.values(actions) }
          : { allowed_structured_tasks: ["segment", "not-an-image-task"] },
      );
    },
  });
  const loaded = await loadImageModelTasks(client, "example");
  assert.deepEqual(
    loaded.actions.map((a) => a.id),
    ["segment"],
  );
  assert.equal(calls.length, 2);
});
test("frame capture retains decoded dimensions and media cursor, and rejects unavailable or tainted pixels", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const video = {
    readyState: 2,
    videoWidth: 640,
    videoHeight: 480,
    currentTime: 12.5,
  } as HTMLVideoElement;
  try {
    const blob = new Blob(["image"], { type: "image/png" });
    let drawn: unknown[] = [];
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: () => ({
          getContext: () => ({
            drawImage: (...args: unknown[]) => {
              drawn = args;
            },
          }),
          toBlob: (cb: (b: Blob) => void) => cb(blob),
        }),
      },
    });
    const frame = await captureVideoFrame(video);
    assert.equal(frame.blob, blob);
    assert.equal(frame.mediaTime, 12.5);
    assert.equal(frame.width, 640);
    assert.deepEqual(drawn, [video, 0, 0, 640, 480]);
    await assert.rejects(
      captureVideoFrame({ ...video, readyState: 1 } as HTMLVideoElement),
      /decoded/,
    );
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: () => ({
          getContext: () => ({
            drawImage: () => {
              throw new Error("Tainted");
            },
          }),
        }),
      },
    });
    await assert.rejects(captureVideoFrame(video), /CORS/);
  } finally {
    if (original) Object.defineProperty(globalThis, "document", original);
    else delete (globalThis as any).document;
  }
});
