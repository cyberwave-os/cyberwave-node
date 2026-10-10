import { useEffect, useState, type ReactNode } from "react";
import { EnvironmentBrowser } from "@cyberwave/react";
import {
  twinSensors,
  type CyberwaveClient,
  type Environment,
  type Twin,
  type TwinSensor,
} from "cyberwave";
import { ConnectedWorkbench } from "./workbench-connection.tsx";
import "@cyberwave/react/styles.css";
import "./workbench.css";

export function SensorWorkbench({
  children,
  videoOnly = false,
}: {
  videoOnly?: boolean;
  children: (twin: Twin, sensor: TwinSensor) => ReactNode;
}) {
  return (
    <ConnectedWorkbench>
      {(client) => (
        <Catalog client={client} videoOnly={videoOnly}>
          {children}
        </Catalog>
      )}
    </ConnectedWorkbench>
  );
}
function Catalog({
  client,
  children,
  videoOnly,
}: {
  videoOnly: boolean;
  client: CyberwaveClient;
  children: (twin: Twin, sensor: TwinSensor) => ReactNode;
}) {
  const [environment, setEnvironment] = useState<Environment>();
  return (
    <div className="workbench-grid">
      <aside className="panel">
        <h2>Choose an environment</h2>
        <EnvironmentBrowser
          onSelect={setEnvironment}
          selectedId={environment?.uuid}
        />
        <p className="muted compact">
          Sensors come from resolved twin capabilities, including inherited
          asset definitions.
        </p>
      </aside>
      <section className="panel">
        {environment ? (
          <Sensors
            key={environment.uuid}
            client={client}
            environment={environment}
            videoOnly={videoOnly}
          >
            {children}
          </Sensors>
        ) : (
          <>
            <span className="tag">Connected catalog</span>
            <h2 className="section-gap">
              Choose a twin and one of its sensors.
            </h2>
            <p className="muted">
              Use the API selector in the header, then choose an environment.
              Private resources need a token for that API.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
function Sensors({
  client,
  environment,
  children,
  videoOnly,
}: {
  videoOnly: boolean;
  client: CyberwaveClient;
  environment: Environment;
  children: (twin: Twin, sensor: TwinSensor) => ReactNode;
}) {
  const [twins, setTwins] = useState<Twin[]>(),
    [selected, setSelected] = useState(""),
    [sensorId, setSensorId] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    client.environments.twins(environment.uuid, { signal: abort.signal }).then(
      (rows) => {
        if (!abort.signal.aborted) setTwins(rows);
      },
      (error) => {
        if (!abort.signal.aborted) setError(error.message);
      },
    );
    return () => abort.abort();
  }, [client, environment.uuid]);
  const twin = twins?.find((item) => item.uuid === selected),
    sensors = twin
      ? twinSensors(twin).filter(
          (sensor) => !videoOnly || ["rgb", "depth"].includes(sensor.type),
        )
      : [],
    sensor = sensors.find((item) => item.id === sensorId);
  return (
    <>
      <h2>{environment.name}</h2>
      {error && (
        <p role="alert" className="cw-error">
          {error}
        </p>
      )}
      {!twins && !error && <p role="status">Loading twins…</p>}
      <div className="fields">
        <label>
          Twin
          <select
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              setSensorId("");
            }}
          >
            <option value="">Select a twin</option>
            {twins?.map((item) => (
              <option key={item.uuid} value={item.uuid}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sensor
          <select
            value={sensorId}
            disabled={!twin}
            onChange={(event) => setSensorId(event.target.value)}
          >
            <option value="">Select a sensor</option>
            {sensors.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.type}
              </option>
            ))}
          </select>
        </label>
      </div>
      {twin && (
        <p className="muted compact">
          {twin.uuid}
          {sensor ? ` / ${sensor.id}` : ""}
        </p>
      )}
      {twin && !sensors.length && (
        <p className="note">
          This twin has no declared{" "}
          {videoOnly ? "RGB/depth cameras" : "sensors"}. Add sensors to its
          asset or twin schema before integrating them in a custom UI.
        </p>
      )}
      {twin && sensor && (
        <div key={`${twin.uuid}:${sensor.id}`} className="section-gap">
          {children(twin, sensor)}
        </div>
      )}
    </>
  );
}
