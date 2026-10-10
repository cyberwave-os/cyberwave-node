import type { components } from "./generated/schema.js";

/** Cyberwave catalog timestamps (including legacy aliases) are microseconds.
 * Follows the application's replay descriptor contract; never infer units by magnitude. */
export function recordingWindow(metadata: Record<string, unknown>) {
  const startUs = metadata.start_timestamp_us ?? metadata.start_timestamp;
  const endUs = metadata.end_timestamp_us ?? metadata.end_timestamp;
  if (
    typeof startUs !== "number" ||
    typeof endUs !== "number" ||
    !Number.isSafeInteger(startUs) ||
    !Number.isSafeInteger(endUs) ||
    startUs <= 0 ||
    endUs < startUs
  )
    return null;
  return { startUs, endUs, durationSeconds: (endUs - startUs) / 1e6 };
}
export type RecordingVideo = {
  twinUuid: string;
  url: string;
  startUs: number;
  endUs: number;
};
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
/** Select only finalized MP4 tracks with a known clock. Chunked and actuation
 * sources need dedicated adapters; returning no video must not mean no recording. */
export function recordingVideos(
  sources: components["schemas"]["RecordingSourcesSchema"],
): RecordingVideo[] {
  const videos: RecordingVideo[] = [];
  for (const [twinUuid, entry] of Object.entries(sources.twin_data)) {
    const camera = object(object(entry)?.camera);
    if (
      !camera ||
      camera.format !== "mp4" ||
      typeof camera.signed_url !== "string" ||
      camera.videos
    )
      continue;
    const window = recordingWindow({
      start_timestamp_us: camera.first_timestamp_us,
      end_timestamp_us: camera.last_timestamp_us,
    });
    if (!window) continue;
    try {
      const url = new URL(camera.signed_url);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        continue;
      videos.push({ twinUuid, url: url.href, ...window });
    } catch {
      /* Incomplete sources are not playable tracks. */
    }
  }
  return videos;
}
export function mediaSecondsToTimestampUs(
  track: Pick<RecordingVideo, "startUs" | "endUs">,
  seconds: number,
): number {
  if (
    !Number.isFinite(seconds) ||
    !Number.isSafeInteger(track.startUs) ||
    !Number.isSafeInteger(track.endUs) ||
    track.endUs < track.startUs
  )
    throw new Error("Invalid recording clock");
  return Math.min(
    track.endUs,
    Math.max(track.startUs, track.startUs + Math.round(seconds * 1e6)),
  );
}
