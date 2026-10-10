import { useState } from "react";
import { createRoot } from "react-dom/client";
import { SensorTelemetryPanel } from "@cyberwave/react";
import type { Twin, TwinSensor } from "cyberwave";
import { SensorWorkbench } from "./sensor-workbench.tsx";
function History({ twin, sensor }: { twin: Twin; sensor: TwinSensor }) {
  const [minutes, setMinutes] = useState(60),
    [end, setEnd] = useState(() => new Date().toISOString());
  const start = new Date(
    new Date(end).getTime() - minutes * 60_000,
  ).toISOString();
  return (
    <>
      <span className="tag">Stored sensor samples</span>
      <h2 className="section-gap">Inspect one sensor at a time.</h2>
      <div className="toolbar fields">
        <label>
          Window{" "}
          <select
            aria-label="Telemetry time window"
            value={minutes}
            onChange={(e) => {
              setMinutes(Number(e.target.value));
              setEnd(new Date().toISOString());
            }}
          >
            <option value={5}>Last 5 minutes</option>
            <option value={60}>Last hour</option>
            <option value={1440}>Last day</option>
            <option value={10080}>Last week</option>
          </select>
        </label>
        <button
          className="cw-button"
          onClick={() => setEnd(new Date().toISOString())}
        >
          Move window to now
        </button>
      </div>
      <p className="muted compact">
        {start} → {end}
      </p>
      <SensorTelemetryPanel
        twinUuid={twin.uuid}
        sensorId={sensor.id}
        start={start}
        end={end}
      />
      <p className="note">
        Only persisted events with this exact sensor ID appear. Unlabeled
        twin-wide events and other sensors are excluded. Values and units are
        shown as recorded; this view does not infer a schema or claim live
        updates.
      </p>
      <details>
        <summary>Use a live subscription in your application</summary>
        <p>
          Supply your application's authenticated MQTT subscription adapter. The
          helper accepts only packets carrying the selected sensor_id and
          releases the subscription on abort.
        </p>
        <pre className="draft-code">{`const stop = await subscribeSensorTelemetry(transport, {\n  twinUuid: ${JSON.stringify(twin.uuid)},\n  sensorId: ${JSON.stringify(sensor.id)},\n  channel: 'imu', // Use the channel your producer publishes.\n  topicPrefix: 'local', // Deployment prefix; production is empty.\n}, sample => renderSample(sample.payload), abort.signal);\n// stop() when leaving this view.`}</pre>
        <p className="muted compact">
          The API connection header configures HTTP only. Broker authentication,
          WebSocket URL and topic prefix belong to your host application; this
          example does not open a broker connection.
        </p>
      </details>
    </>
  );
}
function App() {
  return (
    <main className="studio">
      <div className="studio-heading">
        <div>
          <span className="studio-kicker">OBSERVATION / SENSOR TELEMETRY</span>
          <h1>Understand a single sensor.</h1>
          <p>
            Backend sensor discovery, bounded history and exact identity
            filtering.
          </p>
        </div>
        <a className="studio-link" href="/sensor-video.html">
          Watch sensor video ↗
        </a>
      </div>
      <SensorWorkbench>
        {(twin, sensor) => <History twin={twin} sensor={sensor} />}
      </SensorWorkbench>
    </main>
  );
}
createRoot(document.getElementById("app")!).render(<App />);
