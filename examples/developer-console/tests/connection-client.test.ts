import test from "node:test";
import assert from "node:assert/strict";
test("header and page restoration share one initialization and session", async () => {
  const original = globalThis.fetch,
    calls: string[] = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(options?.method ?? "GET");
    return options?.method === "POST"
      ? Response.json({
          connectionId: "one",
          baseUrl: "https://api.cyberwave.com",
          authenticated: false,
        })
      : Response.json({ detail: "No session" }, { status: 401 });
  };
  try {
    const { restoreConnection } = await import(
      "../src/connection.ts?test=concurrent"
    );
    const [a, b] = await Promise.all([
      restoreConnection(),
      restoreConnection(),
    ]);
    assert.equal(a, b);
    assert.deepEqual(calls, ["GET", "POST"]);
  } finally {
    globalThis.fetch = original;
  }
});
test("gateway failure does not replace the selected API with production", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options?.method, undefined);
    requests++;
    return Response.json({ detail: "Gateway unavailable" }, { status: 503 });
  };
  try {
    const { restoreConnection } = await import(
      "../src/connection.ts?test=unavailable"
    );
    await assert.rejects(restoreConnection(), /Gateway unavailable/);
    await assert.rejects(restoreConnection(), /Gateway unavailable/);
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = original;
  }
});
