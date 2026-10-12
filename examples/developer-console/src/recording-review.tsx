import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  EnvironmentBrowser,
  RecordingBrowser,
  RecordingPlaybackPanel,
} from "@cyberwave/react";
import {
  type CyberwaveClient,
  type Environment,
  type Recording,
} from "cyberwave";
import { ConnectedWorkbench } from "./workbench-connection.tsx";
import { mediaUrl } from "./connection.ts";
import "@cyberwave/react/styles.css";
import "./workbench.css";
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
        <RecordingPlaybackPanel
          key={`${environment.uuid}:${recording.uuid}`}
          environmentUuid={environment.uuid}
          resolveUrl={mediaUrl}
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
