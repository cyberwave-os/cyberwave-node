import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SensorVideoPanel } from "@cyberwave/react/video";
import {
  CapturedFrameReview,
  type CapturedFrame,
} from "@cyberwave/react/annotation";
import "@cyberwave/react/annotation.css";
import { downloadJson } from "./workbench-connection.tsx";
import type { Twin } from "cyberwave";
import type { VideoTarget } from "cyberwave/video";
import { SensorWorkbench } from "./sensor-workbench.tsx";
function Viewer({ twin }: { twin: Twin }) {
  const [source, setSource] = useState<"live" | "simulation">("live"),
    [instance, setInstance] = useState("default");
  const [ice, setIce] = useState('{"iceServers": []}'),
    [configuration, setConfiguration] = useState<RTCConfiguration>(),
    [error, setError] = useState("");
  const [capture, setCapture] = useState<{
    frame: CapturedFrame;
    target: VideoTarget;
  }>();
  useEffect(() => setCapture(undefined), [source, instance, configuration]);
  return (
    <>
      <span className="tag">Reusable SDK camera console</span>
      <h2 className="section-gap">Watch, reconnect and capture.</h2>
      <div className="fields">
        <label>
          Source
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value as typeof source);
              setInstance(e.target.value === "live" ? "default" : "");
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
            onChange={(e) => setInstance(e.target.value)}
            placeholder="Simulation run ID"
          />
        </label>
      </div>
      <details>
        <summary>Deployment ICE configuration</summary>
        <textarea
          aria-label="ICE configuration"
          value={ice}
          onChange={(e) => setIce(e.target.value)}
        />
        <button
          className="cw-button"
          onClick={() => {
            try {
              const value = JSON.parse(ice);
              if (
                !value ||
                typeof value !== "object" ||
                Array.isArray(value) ||
                (value.iceServers !== undefined &&
                  !Array.isArray(value.iceServers))
              )
                throw new Error("Use an RTCConfiguration JSON object.");
              setConfiguration(value);
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Apply ICE configuration
        </button>
        {error && <p role="alert">{error}</p>}
      </details>
      <SensorVideoPanel
        showCapturePreview={false}
        onCapture={(frame, target) => setCapture({ frame, target })}
        rtcConfiguration={configuration}
        twin={twin}
        streamSource={source}
        streamInstanceId={instance.trim()}
      />
      {capture && (
        <div>
          <p className="muted compact">
            Captured sensor: {capture.target.sensorId} ·{" "}
            {capture.target.streamSource} · {capture.target.streamInstanceId}
          </p>
          <CapturedFrameReview
            frame={capture.frame}
            confirmLabel="Export reviewed annotations"
            onConfirm={({ frame, annotations }) =>
              downloadJson("reviewed-frame.json", {
                ...capture.target,
                capturedAt: frame.capturedAt,
                mediaTime: frame.mediaTime,
                width: frame.width,
                height: frame.height,
                annotations,
              })
            }
          />
        </div>
      )}
      <p className="muted compact">
        Use the running simulation's exact stream instance. Viewing is
        receive-only; starting a simulation and moving a robot remain explicit
        application controls. Capture enables only after the browser decodes
        video.
      </p>
      <a className="studio-link" href="/sensor-telemetry.html">
        Receive live sensor telemetry ↗
      </a>
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
            A higher-level SDK component owns discovery, viewing, reconnect and
            capture.
          </p>
        </div>
        <a className="studio-link" href="/recording-review.html">
          Review recordings ↗
        </a>
      </div>
      <SensorWorkbench videoOnly selectSensor={false}>
        {(twin) => <Viewer twin={twin} />}
      </SensorWorkbench>
    </main>
  );
}
createRoot(document.getElementById("app")!).render(<App />);
