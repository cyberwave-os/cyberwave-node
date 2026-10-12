import type { Environment } from "./index.js";

/** Display-only WGS84 position. No inference from local scene coordinates or chainage. */
export type MapLocation = {
  id: string;
  label: string;
  longitude: number;
  latitude: number;
  detail?: string;
  color?: string;
};
export function validMapLocation(
  item: Pick<MapLocation, "longitude" | "latitude">,
): boolean {
  return (
    typeof item.longitude === "number" &&
    Number.isFinite(item.longitude) &&
    Math.abs(item.longitude) <= 180 &&
    typeof item.latitude === "number" &&
    Number.isFinite(item.latitude) &&
    Math.abs(item.latitude) <= 90
  );
}
/** Reuse the existing backend geo-anchor contract. Only a confirmed site origin is projected. */
export function environmentMapLocation(
  environment: Pick<Environment, "uuid" | "name" | "settings">,
): MapLocation | undefined {
  const geo = environment.settings?.geo;
  if (!geo || typeof geo !== "object" || Array.isArray(geo)) return;
  const anchor = geo as Record<string, unknown>;
  if (anchor.contract_version !== 1 || anchor.anchor_status !== "manual")
    return;
  const item = {
    id: environment.uuid,
    label: environment.name,
    longitude: anchor.longitude,
    latitude: anchor.latitude,
  };
  if (
    !validMapLocation(item as MapLocation) ||
    Math.abs(anchor.latitude as number) > 89.9
  )
    return;
  return {
    ...item,
    detail: "Environment origin · not an individual finding position",
  } as MapLocation;
}
