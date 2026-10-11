"use client";
import { useState } from "react";
import { recordingVideos, recordingWindow, type Recording } from "cyberwave";
import { RecordingVideo, useRecordingPlayback, useCyberwave } from "./index.js";
import { useResourceKey } from "./resource.js";
const identityUrl = (url: string) => url;
export function RecordingPlaybackPanel(props: {
  environmentUuid: string;
  recording: Recording;
  resolveUrl?: (url: string) => string;
}) {
  const key = useResourceKey(
    useCyberwave(),
    props.environmentUuid,
    props.recording.uuid,
    props.resolveUrl,
  );
  return (
    <Playback
      key={key}
      {...props}
      resolveUrl={props.resolveUrl ?? identityUrl}
    />
  );
}
function Playback({
  environmentUuid,
  resolveUrl,
  recording,
}: {
  environmentUuid: string;
  resolveUrl: (url: string) => string;
  recording: Recording;
}) {
  const [refresh, setRefresh] = useState(0),
    [trackIndex, setTrackIndex] = useState(0),
    [seconds, setSeconds] = useState(0),
    [failed, setFailed] = useState(false);
  const state = useRecordingPlayback(environmentUuid, recording.uuid, refresh),
    window = recordingWindow(recording.metadata);
  const tracks =
      state.data?.status === "ready" ? recordingVideos(state.data.sources) : [],
    track = tracks[trackIndex];
  return (
    <section className="cw-browser cw-workflows">
      <span className="cw-eyebrow">Recorded evidence · read only</span>
      <h2 className="section-gap">
        {String(
          recording.metadata.session_name_defined_by_user ||
            recording.metadata.recording_type ||
            "Recording review",
        )}
      </h2>
      <p className="muted compact">{recording.uuid}</p>
      {window && (
        <div className="cw-metrics">
          <div>
            <strong>{window.durationSeconds.toFixed(1)}s</strong>
            <span>Recorded time window</span>
          </div>
          <div>
            <strong>{seconds.toFixed(2)}s</strong>
            <span>Media-relative cursor</span>
          </div>
        </div>
      )}
      {state.loading && <p role="status">Loading playback sources…</p>}
      {state.error && (
        <p role="alert" className="cw-error">
          {state.error.message}
        </p>
      )}
      {state.data?.status === "materializing" && (
        <p className="note">
          Playback assets are still being prepared. {state.data.detail}{" "}
          {state.data.retryAfterSeconds
            ? `Retry after ${state.data.retryAfterSeconds}s.`
            : ""}
        </p>
      )}
      {tracks.length > 1 && (
        <div className="field">
          <label>
            Camera track
            <select
              value={trackIndex}
              onChange={(e) => {
                setTrackIndex(Number(e.target.value));
                setSeconds(0);
                setFailed(false);
              }}
            >
              {tracks.map((t, i) => (
                <option value={i} key={t.twinUuid}>
                  {t.twinUuid}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {track && (
        <RecordingVideo
          key={`${refresh}:${trackIndex}`}
          src={resolveUrl(track.url)}
          onTime={setSeconds}
          onError={() => setFailed(true)}
        />
      )}
      {state.data?.status === "ready" && !tracks.length && (
        <p className="note">
          This recording has no finalized MP4 track with a known clock. Its
          actuation, point cloud or chunked streams require the corresponding
          replay adapter; an empty video view does not mean the recording is
          empty.
        </p>
      )}
      {failed && (
        <p className="cw-error" role="alert">
          Media could not load. Refresh sources if the signed URL has expired or
          check codec/storage support.
        </p>
      )}
      <div className="toolbar">
        <button
          className="cw-button"
          disabled={state.loading}
          onClick={() => {
            setFailed(false);
            setSeconds(0);
            setTrackIndex(0);
            setRefresh(refresh + 1);
          }}
        >
          Refresh playback sources
        </button>
      </div>
      <p className="muted compact">
        Catalog timestamps use microseconds. The video cursor uses media
        seconds. Frame-accurate video/robot alignment requires capture timing
        and SEI data; this player does not claim synchronized 3D replay.
      </p>
      <details>
        <summary>Recording metadata</summary>
        <pre className="draft-code">
          {JSON.stringify(
            {
              metadata: recording.metadata,
              readiness: recording.playback_readiness,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </section>
  );
}
