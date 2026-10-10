import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  EnvironmentBrowser,
  RecordingBrowser,
  RecordingVideo,
  useRecordingPlayback,
} from "@cyberwave/react";
import {
  recordingVideos,
  recordingWindow,
  type CyberwaveClient,
  type Environment,
  type Recording,
} from "cyberwave";
import { ConnectedWorkbench } from "./workbench-connection.tsx";
import { mediaUrl } from "./connection.ts";
import "@cyberwave/react/styles.css";
import "./workbench.css";
function Playback({
  environment,
  recording,
}: {
  environment: Environment;
  recording: Recording;
}) {
  const [refresh, setRefresh] = useState(0),
    [trackIndex, setTrackIndex] = useState(0),
    [seconds, setSeconds] = useState(0),
    [failed, setFailed] = useState(false);
  const state = useRecordingPlayback(environment.uuid, recording.uuid, refresh),
    window = recordingWindow(recording.metadata);
  const tracks =
      state.data?.status === "ready" ? recordingVideos(state.data.sources) : [],
    track = tracks[trackIndex];
  return (
    <section className="panel">
      <span className="tag">Recorded evidence · read only</span>
      <h2 className="section-gap">
        {String(
          recording.metadata.session_name_defined_by_user ||
            recording.metadata.recording_type ||
            "Recording review",
        )}
      </h2>
      <p className="muted compact">{recording.uuid}</p>
      {window && (
        <div className="metric-row">
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
        <div className="fields">
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
          src={mediaUrl(track.url)}
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
        <a className="studio-link" href="/inspection-workbench.html">
          Review inspection findings ↗
        </a>
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
function Catalog({ client }: { client: CyberwaveClient }) {
  const [environment, setEnvironment] = useState<Environment>(),
    [recording, setRecording] = useState<Recording>();
  useEffect(() => {
    setEnvironment(undefined);
    setRecording(undefined);
  }, [client]);
  return (
    <div className="workbench-grid">
      <aside className="panel">
        <h2>Load an environment</h2>
        <EnvironmentBrowser
          onSelect={(e) => {
            setRecording(undefined);
            setEnvironment(e);
          }}
          selectedId={environment?.uuid}
        />
        {environment && (
          <div className="section-gap">
            <h2>{environment.name} · recordings</h2>
            <RecordingBrowser
              environmentUuid={environment.uuid}
              selectedId={recording?.uuid}
              onSelect={setRecording}
            />
          </div>
        )}
      </aside>
      {environment && recording ? (
        <Playback
          key={`${environment.uuid}:${recording.uuid}`}
          environment={environment}
          recording={recording}
        />
      ) : (
        <section className="panel">
          <span className="tag">Cyberwave catalog</span>
          <h2 className="section-gap">
            Open a recording from your environment
          </h2>
          <p className="muted">
            Connect to production or a custom API, select an environment, and
            browse its recording history. The catalog supports cursor
            pagination; playback sources are loaded only when selected.
          </p>
          <p className="note">
            Private environments need an API token. A local API can reuse the
            token configured in the development gateway. No demonstration
            recordings are mixed into API results.
          </p>
        </section>
      )}
    </div>
  );
}
function App() {
  return (
    <main className="studio">
      <div className="studio-heading">
        <div>
          <span className="studio-kicker">OBSERVATION / RECORDING REVIEW</span>
          <h1>Revisit what happened.</h1>
          <p>
            Reusable environment and recording browsers, lazy playback, and
            explicit readiness.
          </p>
        </div>
        <a href="/environments.html" className="studio-link">
          Open 3D environment ↗
        </a>
      </div>
      <ConnectedWorkbench>
        {(client) => <Catalog client={client} />}
      </ConnectedWorkbench>
    </main>
  );
}
createRoot(document.getElementById("app")!).render(<App />);
