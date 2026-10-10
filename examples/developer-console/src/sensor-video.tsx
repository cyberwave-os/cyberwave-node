import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { VideoStream } from "@cyberwave/react/video";
import {
  captureVideoFrame,
  type CapturedFrame,
} from "@cyberwave/react/annotation";
import type { Twin, TwinSensor } from "cyberwave";
import { SensorWorkbench } from "./sensor-workbench.tsx";

function Viewer({ twin, sensor }: { twin: Twin; sensor: TwinSensor }) {
  const [source, setSource] = useState<"live" | "simulation">("live"),
    [instance, setInstance] = useState("default"),
    [kind, setKind] = useState<"rgb" | "depth">(
      sensor.type === "depth" ? "depth" : "rgb",
    );
  const [running, setRunning] = useState(false),
    [ice, setIce] = useState('{"iceServers": []}'),
    [configuration, setConfiguration] = useState<RTCConfiguration>();
  const [frame, setFrame] = useState<CapturedFrame>(),
    [frameUrl, setFrameUrl] = useState(""),
    [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!frame) {
      setFrameUrl("");
      return;
    }
    const url = URL.createObjectURL(frame.blob);
    setFrameUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [frame]);
  function reset() {
    setRunning(false);
    setFrame(undefined);
    setError("");
  }
  function start() {
    try {
      const config = JSON.parse(ice);
      if (
        !config ||
        typeof config !== "object" ||
        Array.isArray(config) ||
        (config.iceServers !== undefined && !Array.isArray(config.iceServers))
      )
        throw new Error("Use an RTCConfiguration JSON object.");
      setConfiguration(config);
      setError("");
      setRunning(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <span className="tag">Receive-only viewer</span>
      <h2 className="section-gap">One camera. One stream.</h2>
      <div className="fields">
        <label>
          Source
          <select
            value={source}
            onChange={(e) => {
              reset();
              setSource(e.target.value as typeof source);
            }}
          >
            <option value="live">Live</option>
            <option value="simulation">Simulation</option>
          </select>
        </label>
        <label>
          Stream instance
          <input
            value={instance}
            onChange={(e) => {
              reset();
              setInstance(e.target.value);
            }}
            placeholder="default"
          />
        </label>
        <label>
          Video kind
          <select
            value={kind}
            onChange={(e) => {
              reset();
              setKind(e.target.value as typeof kind);
            }}
          >
            <option value="rgb">RGB</option>
            <option value="depth">Depth</option>
          </select>
        </label>
      </div>
      <details className="section-gap">
        <summary>Deployment ICE configuration</summary>
        <p className="muted compact">
          Supply the STUN/TURN configuration for your deployment when direct
          connectivity is unavailable. It stays in this page's memory.
        </p>
        <textarea
          aria-label="ICE configuration"
          rows={4}
          value={ice}
          onChange={(e) => {
            reset();
            setIce(e.target.value);
          }}
        />
      </details>
      <div className="toolbar">
        <button
          className="cw-button cw-primary"
          disabled={running || !instance.trim()}
          onClick={start}
        >
          Watch stream
        </button>
        <button className="cw-button" disabled={!running} onClick={reset}>
          Stop viewing
        </button>
        <button
          className="cw-button"
          disabled={!running}
          onClick={async () => {
            try {
              setFrame(await captureVideoFrame(video.current!));
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Capture decoded frame
        </button>
      </div>
      {error && (
        <p role="alert" className="cw-error">
          {error}
        </p>
      )}
      {running ? (
        <VideoStream
          ref={video}
          target={{
            twinUuid: twin.uuid,
            sensorId: sensor.id,
            streamSource: source,
            streamInstanceId: instance.trim(),
            kind,
          }}
          rtcConfiguration={configuration}
        />
      ) : (
        <p className="note">
          Choose an active camera producer, then watch its stream. Simulation
          must already be running and publishing this sensor.
        </p>
      )}
      <p className="muted compact">
        This example negotiates through the authenticated local API. A missing
        producer returns 409; a signaling timeout returns 504. It never starts a
        camera, simulation, recording or robot command. Stop and watch again to
        reconnect.
      </p>
      {frame && frameUrl && (
        <div className="panel">
          <h3>Captured frame</h3>
          <img
            className="cw-recording-video"
            src={frameUrl}
            alt={`Captured frame from ${sensor.name}`}
          />
          <p>
            {frame.width} × {frame.height} · {frame.capturedAt}
          </p>
          <p className="muted compact">
            Browser capture time; not a calibrated sensor timestamp.
          </p>
          <a
            className="studio-link"
            href={frameUrl}
            download={`${sensor.id}-frame.png`}
          >
            Download PNG
          </a>
          {" · "}
          <a className="studio-link" href="/image-annotation.html">
            Open capture & annotation example ↗
          </a>
        </div>
      )}
    </>
  );
}
function App() {
  return (
    <main className="studio">
      <div className="studio-heading">
        <div>
          <span className="studio-kicker">OBSERVATION / SENSOR VIDEO</span>
          <h1>Build your camera experience.</h1>
          <p>
            Discover a sensor, select its source, watch and capture a frame.
          </p>
        </div>
        <a className="studio-link" href="/recording-review.html">
          Review recordings ↗
        </a>
      </div>
      <SensorWorkbench videoOnly>
        {(twin, sensor) => <Viewer twin={twin} sensor={sensor} />}
      </SensorWorkbench>
    </main>
  );
}
createRoot(document.getElementById("app")!).render(<App />);
