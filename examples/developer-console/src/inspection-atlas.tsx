import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  EnvironmentBrowser,
  InspectionCampaignBrowser,
  useInspectionCampaign,
  InspectionObservationList,
  InspectionObservationDetails,
  EvidencePreview,
  RecordingBrowser,
  RecordingPlaybackPanel,
} from "@cyberwave/react";
import { LocationMap } from "@cyberwave/react/gis";
import {
  environmentMapLocation,
  type CyberwaveClient,
  type Environment,
  type Recording,
} from "cyberwave";
import { mediaUrl } from "./connection.ts";
import { ConnectedWorkbench } from "./workbench-connection.tsx";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "@cyberwave/react/styles.css";
import "./gis-journeys.css";
function SupportingRecordings({ environmentId }: { environmentId: string }) {
  const [recording, setRecording] = useState<Recording>();
  return (
    <details>
      <summary>Browse supporting recordings</summary>
      <p>
        Choose a recording explicitly. This selection does not create or prove
        an evidence association.
      </p>
      <RecordingBrowser
        environmentUuid={environmentId}
        selectedId={recording?.uuid}
        onSelect={setRecording}
      />
      {recording && (
        <RecordingPlaybackPanel
          environmentUuid={environmentId}
          recording={recording}
          resolveUrl={mediaUrl}
        />
      )}
    </details>
  );
}
function Site({ environment }: { environment: Environment }) {
  const [campaignId, setCampaign] = useState(""),
    [observationId, setObservation] = useState("");
  const state = useInspectionCampaign(environment.uuid, campaignId),
    campaign = state.data;
  const locations = useMemo(() => {
    const p = environmentMapLocation(environment);
    return p ? [p] : [];
  }, [environment]);
  const observation = campaign?.observations.find(
    (o) => o.uuid === observationId,
  );
  return (
    <>
      <div className="gis-grid">
        <aside className="panel">
          <h2>{environment.name}</h2>
          <InspectionCampaignBrowser
            environmentId={environment.uuid}
            selectedId={campaignId}
            onSelect={(c) => {
              setCampaign(c.uuid);
              setObservation("");
            }}
          />
        </aside>
        <section className="panel">
          <LocationMap
            locations={locations}
            selectedId={environment.uuid}
            onSelect={() => {}}
          />
          <p className="muted">
            {locations.length
              ? "Confirmed environment origin. Findings are located by their own reference and chainage below."
              : "This environment has no confirmed geo anchor. Campaigns remain available without inventing a map position."}
          </p>
        </section>
      </div>
      {state.loading && <p role="status">Loading campaign…</p>}
      {state.error && (
        <p role="alert" className="cw-error">
          {state.error.message}
        </p>
      )}
      {campaign && (
        <div className="gis-results panel section-gap">
          <InspectionObservationList
            campaign={campaign}
            selectedId={observationId}
            onSelect={(o) => setObservation(o.uuid)}
          />
          {observation ? (
            <InspectionObservationDetails observation={observation}>
              <EvidencePreview
                caption={`Evidence reference: ${observation.source.evidence?.reference ?? "unavailable"}`}
                unavailableReason="Resolve this reference through your authorized media service. A reference is not automatically a playable URL."
              />
              <SupportingRecordings
                key={observation.uuid}
                environmentId={environment.uuid}
              />
            </InspectionObservationDetails>
          ) : (
            <div>
              <h3>{campaign.name}</h3>
              <p>
                Choose an observation to inspect evidence, measurements and
                review history.
              </p>
              <p>
                Asset reference: {campaign.asset_reference} ·{" "}
                {campaign.reference_version}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
function Atlas({ client }: { client: CyberwaveClient }) {
  const [environment, setEnvironment] = useState<Environment>(),
    [error, setError] = useState("");
  // List responses may omit settings: resolve the selected environment through the existing detail endpoint.
  const [selectedId, select] = useState("");
  useEffect(() => {
    setEnvironment(undefined);
    setError("");
    if (!selectedId) return;
    const abort = new AbortController();
    client.environments
      .get(selectedId, { signal: abort.signal })
      .then((value) => {
        if (!abort.signal.aborted) setEnvironment(value);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [client, selectedId]);
  return (
    <>
      <details open={!selectedId} className="panel">
        <summary>Choose an environment</summary>
        <EnvironmentBrowser
          selectedId={selectedId}
          onSelect={(e) => select(e.uuid)}
        />
      </details>
      {error && <p role="alert">{error}</p>}
      {environment?.uuid === selectedId && (
        <Site key={environment.uuid} environment={environment} />
      )}
    </>
  );
}
function App() {
  return (
    <main className="gis-studio">
      <div className="gis-heading">
        <div>
          <span className="gis-kicker">INSPECTION / STORED CAMPAIGNS</span>
          <h1>A place, its history, the evidence.</h1>
          <p>
            Use the API header to browse authorized environments and stored
            results.
          </p>
        </div>
        <a href="/asset-operations.html">
          Explore the asset operations demo ↗
        </a>
      </div>
      <ConnectedWorkbench>
        {(client) => <Atlas client={client} />}
      </ConnectedWorkbench>
    </main>
  );
}
createRoot(document.getElementById("app")!).render(<App />);
