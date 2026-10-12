/** Draft-only application logic. This is deliberately not an autopilot compiler. */
export type Aircraft = "multirotor" | "fixed-wing" | "vtol";
export type AerialDraft = {
  objective: "crop-survey" | "thermal-observation";
  aircraft: Aircraft;
  widthM: number;
  lengthM: number;
  altitudeM: number;
  altitudeReference: "AGL" | "AMSL" | "ELLIPSOID";
  speedMps: number;
  bankDegrees: number;
  overlap: number;
  cameraFovDegrees: number;
  enduranceMinutes: number;
  reservePercent: number;
  runwayM: number;
  requiredRunwayM: number;
  takeoff: "vertical" | "runway" | "catapult";
  landing: "vertical" | "runway" | "recovery";
  startAt: string;
};
export type { Position as Point } from "./domain.ts";
import type { Position as Point } from "./domain.ts";
import { sampleRoute } from "./simulation.ts";
export const initialAerialDraft: AerialDraft = {
  objective: "crop-survey",
  aircraft: "multirotor",
  widthM: 240,
  lengthM: 400,
  altitudeM: 60,
  altitudeReference: "AGL",
  speedMps: 8,
  bankDegrees: 25,
  overlap: 0.7,
  cameraFovDegrees: 60,
  enduranceMinutes: 25,
  reservePercent: 25,
  runwayM: 160,
  requiredRunwayM: 200,
  takeoff: "vertical",
  landing: "vertical",
  startAt: "",
};
export function aerialPreview(draft: AerialDraft) {
  const d = draft,
    issues: string[] = [];
  const valid =
    Object.values(d).every(
      (v) => typeof v !== "number" || Number.isFinite(v),
    ) &&
    d.widthM > 0 &&
    d.widthM <= 5000 &&
    d.lengthM > 0 &&
    d.lengthM <= 5000 &&
    d.altitudeM > 0 &&
    d.altitudeM <= 2000 &&
    d.speedMps > 0 &&
    d.speedMps <= 100 &&
    d.overlap >= 0 &&
    d.overlap < 0.95 &&
    d.cameraFovDegrees > 0 &&
    d.cameraFovDegrees < 170 &&
    d.bankDegrees > 0 &&
    d.bankDegrees < 80 &&
    d.enduranceMinutes > 0 &&
    d.reservePercent >= 0 &&
    d.reservePercent < 100 &&
    d.runwayM >= 0 &&
    d.requiredRunwayM > 0;
  if (!valid)
    return {
      points: [] as Point[],
      distanceM: 0,
      durationMinutes: 0,
      laneSpacingM: 0,
      turnRadiusM: 0,
      issues: [
        "Enter finite dimensions and performance values within the example limits.",
      ],
    };
  // A flat-ground footprint assumption; AGL cannot be substituted for ellipsoid/AMSL height.
  if (d.altitudeReference !== "AGL")
    return {
      points: [] as Point[],
      distanceM: 0,
      durationMinutes: 0,
      laneSpacingM: 0,
      turnRadiusM: 0,
      issues: [
        "Terrain elevation and a vertical datum transform are required before deriving ground coverage from AMSL or ellipsoid altitude.",
      ],
    };
  const laneSpacingM =
    2 *
    d.altitudeM *
    Math.tan((d.cameraFovDegrees * Math.PI) / 360) *
    (1 - d.overlap);
  const count = Math.max(2, Math.ceil(d.widthM / laneSpacingM) + 1);
  if (count > 128)
    return {
      points: [] as Point[],
      distanceM: 0,
      durationMinutes: 0,
      laneSpacingM,
      turnRadiusM: 0,
      issues: [
        "Draft exceeds the 128-lane preview limit. Reduce the area or change the camera/overlap.",
      ],
    };
  const points: Point[] = [];
  for (let i = 0; i < count; i++) {
    const x = -d.widthM / 2 + (i * d.widthM) / (count - 1);
    for (const y of i % 2
      ? [d.lengthM / 2, -d.lengthM / 2]
      : [-d.lengthM / 2, d.lengthM / 2])
      points.push({ x, y, z: d.altitudeM });
  }
  const distanceM = points
    .slice(1)
    .reduce(
      (sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y),
      0,
    );
  const durationMinutes = distanceM / d.speedMps / 60;
  const turnRadiusM =
    d.aircraft === "multirotor"
      ? 0
      : d.speedMps ** 2 / (9.80665 * Math.tan((d.bankDegrees * Math.PI) / 180));
  if (
    d.aircraft === "fixed-wing" &&
    (d.takeoff === "vertical" || d.landing === "vertical")
  )
    issues.push(
      "Conventional fixed-wing needs a supported launch and recovery method; vertical operations are incompatible.",
    );
  if (
    d.aircraft === "multirotor" &&
    (d.takeoff !== "vertical" || d.landing !== "vertical")
  )
    issues.push("This multirotor example uses vertical launch and recovery.");
  if (
    (d.takeoff === "runway" || d.landing === "runway") &&
    d.runwayM < d.requiredRunwayM
  )
    issues.push(
      "Available runway is shorter than the illustrative aircraft requirement.",
    );
  if (turnRadiusM > 0)
    issues.push(
      `The ${turnRadiusM.toFixed(0)} m still-air turn-radius estimate needs a turn-aware route and containment check. Straight lane connectors are not flyable turns.`,
    );
  if (d.aircraft === "vtol")
    issues.push(
      "Reserve a transition corridor and validate transition speed/altitude against the selected airframe.",
    );
  if (durationMinutes > d.enduranceMinutes * (1 - d.reservePercent / 100))
    issues.push(
      "Survey-only time exceeds endurance after the requested reserve.",
    );
  if (
    d.startAt &&
    (!/(Z|[+-]\d{2}:\d{2})$/.test(d.startAt) ||
      !Number.isFinite(Date.parse(d.startAt)))
  )
    issues.push(
      "Start time must be an ISO timestamp with an explicit UTC offset.",
    );
  issues.push(
    "Terrain, obstacles, airspace, weather, link coverage and emergency recovery have not been checked.",
  );
  issues.push(
    "Launch, transit, turns, climb and recovery time/energy are excluded from this estimate.",
  );
  if (d.objective === "thermal-observation")
    issues.push(
      "A heat signature is an observation proposal. Confirmation and incident response require a qualified operator and an approved operating plan.",
    );
  return {
    points,
    distanceM,
    durationMinutes,
    laneSpacingM,
    turnRadiusM,
    issues,
  };
}
export function routePosition(
  points: Point[],
  fraction: number,
): Point | undefined {
  if (!points.length) return;
  const { duration } = sampleRoute(points, 1, 0);
  return sampleRoute(points, 1, duration * Math.min(1, Math.max(0, fraction)))
    .position;
}
