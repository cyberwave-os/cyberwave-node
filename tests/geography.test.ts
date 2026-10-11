import test from "node:test";
import assert from "node:assert/strict";
import { environmentMapLocation, validMapLocation } from "../src/geography.ts";
const env = (geo?: unknown) => ({
  uuid: "site",
  name: "Site",
  settings: geo === undefined ? {} : { geo },
});
test("missing, cloned and unsupported geo anchors never become map coordinates", () => {
  for (const geo of [
    undefined,
    {},
    {
      contract_version: 1,
      anchor_status: "unverified",
      longitude: 12,
      latitude: 42,
    },
    {
      contract_version: 2,
      anchor_status: "manual",
      longitude: 12,
      latitude: 42,
    },
  ])
    assert.equal(environmentMapLocation(env(geo)), undefined);
});
test("a confirmed origin at zero is real, while invalid or string coordinates are omitted", () => {
  assert.deepEqual(
    environmentMapLocation(
      env({
        contract_version: 1,
        anchor_status: "manual",
        longitude: 0,
        latitude: 0,
      }),
    ),
    {
      id: "site",
      label: "Site",
      longitude: 0,
      latitude: 0,
      detail: "Environment origin · not an individual finding position",
    },
  );
  for (const longitude of [undefined, "12", NaN, Infinity, 181])
    assert.equal(
      environmentMapLocation(
        env({
          contract_version: 1,
          anchor_status: "manual",
          longitude,
          latitude: 42,
        }),
      ),
      undefined,
    );
});
test("map coordinate validation does not coerce nulls or local XY values into geographic positions", () => {
  assert.equal(validMapLocation({ latitude: 90, longitude: -180 }), true);
  for (const latitude of [null, "42", true, Infinity, 91])
    assert.equal(
      validMapLocation({ latitude: latitude as number, longitude: 12 }),
      false,
    );
});
