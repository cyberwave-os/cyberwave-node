import test from "node:test";
import assert from "node:assert/strict";
import {
  aerialPreview,
  initialAerialDraft,
  routePosition,
} from "../src/aerial-domain.ts";
import {
  compareObservations,
  demoFindings,
  reviewFinding,
} from "../src/inspection-domain.ts";
test("aerial draft bounds work and refuses to substitute AMSL for AGL", () => {
  const a = aerialPreview(initialAerialDraft);
  assert.ok(a.points.length > 2);
  assert.ok(a.distanceM > 0);
  assert.equal(
    aerialPreview({ ...initialAerialDraft, altitudeReference: "AMSL" }).points
      .length,
    0,
  );
  for (const patch of [
    { speedMps: NaN },
    { overlap: 1 },
    { widthM: Infinity },
    { bankDegrees: 90 },
    { enduranceMinutes: 0 },
  ])
    assert.equal(
      aerialPreview({ ...initialAerialDraft, ...patch }).points.length,
      0,
    );
});
test("fixed wing exposes incompatible vertical launch and insufficient runway", () => {
  const a = aerialPreview({
    ...initialAerialDraft,
    aircraft: "fixed-wing",
    speedMps: 20,
  });
  assert.ok(a.issues.some((i) => i.includes("vertical operations")));
  assert.ok(a.turnRadiusM > 80);
  const b = aerialPreview({
    ...initialAerialDraft,
    aircraft: "fixed-wing",
    takeoff: "runway",
    landing: "runway",
  });
  assert.ok(b.issues.some((i) => i.includes("runway is shorter")));
  assert.ok(b.issues.some((i) => i.includes("not flyable turns")));
});
test("VTOL transition, endurance reserve and timezone remain explicit", () => {
  const a = aerialPreview({
    ...initialAerialDraft,
    aircraft: "vtol",
    enduranceMinutes: 1,
    startAt: "2026-11-01T09:00:00",
  });
  assert.ok(a.issues.some((i) => i.includes("transition corridor")));
  assert.ok(a.issues.some((i) => i.includes("exceeds endurance")));
  assert.ok(a.issues.some((i) => i.includes("UTC offset")));
});
test("kinematic cursor interpolates by length and clamps endpoints", () => {
  const p = [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
    { x: 10, y: 30, z: 0 },
  ];
  assert.deepEqual(routePosition(p, 0.5), { x: 10, y: 10, z: 0 });
  assert.deepEqual(routePosition(p, 2), p[2]);
  assert.deepEqual(routePosition(p, -1), p[0]);
});
test("overlapping measurement uncertainty is not declared deterioration", () => {
  const [a, b] = demoFindings[0].observations;
  assert.equal(compareObservations(a, b).status, "within-uncertainty");
  assert.equal(
    compareObservations({ ...a, unit: "px" }, b).status,
    "not-assessable",
  );
});
test("missing coverage is not resolution; real supported change is distinguishable", () => {
  assert.equal(
    compareObservations(...(demoFindings[2].observations as [any, any])).status,
    "not-assessable",
  );
  assert.equal(
    compareObservations(...(demoFindings[1].observations as [any, any])).status,
    "increase",
  );
});
test("review requires a reason and adds a revision without erasing source observations", () => {
  const f = demoFindings[0];
  assert.throws(() =>
    reviewFinding(f, "validated", "  ", "2026-10-10T12:00:00Z"),
  );
  const reviewed = reviewFinding(
    f,
    "validated",
    "Intervals overlap; cannot conclude worsening.",
    "2026-10-10T12:00:00Z",
  );
  assert.equal(reviewed.revisions.length, 1);
  assert.equal(f.revisions.length, 0);
  assert.deepEqual(reviewed.observations, f.observations);
});
