import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ActivityResults,
  MeasurementCard,
  EvidencePreview,
} from "@cyberwave/react";
import { LocationMap } from "@cyberwave/react/gis";
import { OpenStreetMapImageryProvider } from "cesium";
import { sites } from "./gis-scenarios.ts";
import { downloadJson } from "./workbench-connection.tsx";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "@cyberwave/react/styles.css";
import "./gis-journeys.css";
const streetMap = () =>
  new OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" });
function App() {
  const [query, setQuery] = useState(""),
    [siteId, setSite] = useState("water"),
    [activityId, setActivity] = useState("round"),
    [resultId, setResult] = useState("pressure"),
    [tiles, setTiles] = useState(true);
  const visible = useMemo(
    () =>
      sites.filter((s) =>
        `${s.label} ${s.sector}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );
  const site = visible.find((s) => s.id === siteId),
    activity = site?.activities.find((a) => a.id === activityId),
    result = activity?.results.find((r) => r.id === resultId);
  function choose(id: string) {
    const site = sites.find((s) => s.id === id);
    setSite(id);
    setActivity(site?.activities[0]?.id || "");
    setResult(site?.activities[0]?.results[0]?.id || "");
  }
  return (
    <main className="gis-studio">
      <div className="gis-heading">
        <div>
          <span className="gis-kicker">OPERATIONS / FROM MAP TO EVIDENCE</span>
          <h1>Every site. Every activity. One journey.</h1>
          <p>
            Find an asset, inspect its activity history, then understand the
            result.
          </p>
        </div>
        <span className="tag amber">Invented sites & results · local demo</span>
      </div>
      <div className="gis-grid">
        <aside className="panel">
          <h2>Asset register</h2>
          <label className="gis-field">
            Find an asset
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search site or industry"
            />
          </label>
          <div className="cw-resource-list">
            {visible.map((s) => (
              <button
                className={`cw-resource ${siteId === s.id ? "cw-selected" : ""}`}
                key={s.id}
                onClick={() => choose(s.id)}
                aria-pressed={siteId === s.id}
              >
                <span>
                  <strong>{s.label}</strong>
                  <small>
                    {s.sector} · {s.activities.length}{" "}
                    {s.activities.length === 1 ? "activity" : "activities"}
                  </small>
                </span>
              </button>
            ))}
          </div>
          {!visible.length && <p>No matching assets.</p>}
          <p className="muted">
            Markers locate sites, not individual equipment or observations.
          </p>
          <a href="/inspection-atlas.html">
            Browse stored inspection campaigns ↗
          </a>
        </aside>
        <section className="panel">
          <LocationMap
            locations={visible}
            selectedId={site?.id}
            onSelect={choose}
            imageryProvider={tiles ? streetMap : undefined}
          />
          <label className="gis-toggle">
            <input
              type="checkbox"
              checked={tiles}
              onChange={(e) => setTiles(e.target.checked)}
            />{" "}
            OpenStreetMap basemap
          </label>
          {tiles && (
            <p className="muted">
              <small>
                Map ©{" "}
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                >
                  OpenStreetMap contributors
                </a>
              </small>
            </p>
          )}
        </section>
      </div>
      {site && (
        <section className="panel section-gap">
          <span className="gis-kicker">{site.sector}</span>
          <h2>{site.label}</h2>
          <div className="gis-activity-tabs" aria-label="Asset activities">
            {site.activities.map((a) => (
              <button
                className="cw-resource"
                aria-pressed={activity?.id === a.id}
                key={a.id}
                onClick={() => {
                  setActivity(a.id);
                  setResult(a.results[0]?.id || "");
                }}
              >
                <span>
                  <strong>{a.name}</strong>
                  <small>
                    {a.status} · {a.date}
                  </small>
                </span>
              </button>
            ))}
          </div>
          {activity && (
            <>
              <div className="gis-section-head">
                <h3>{activity.name}</h3>
                <button
                  className="cw-button"
                  onClick={() =>
                    downloadJson("activity-results.json", {
                      site: site.id,
                      activity,
                      synthetic: true,
                    })
                  }
                >
                  Export activity results
                </button>
              </div>
              <div className="gis-results">
                <ActivityResults
                  key={activity.id}
                  results={activity.results}
                  selectedId={result?.id}
                  onSelect={(r) => setResult(r.id)}
                />
                {result && (
                  <MeasurementCard result={result}>
                    <EvidencePreview
                      caption={
                        result.outcome === "unavailable"
                          ? "Supporting evidence"
                          : result.id === "hotspot" ||
                              result.id === "temperature"
                            ? "Synthetic thermal diagram · not a sensor image"
                            : "Synthetic inspection diagram · not photographic evidence"
                      }
                      src={
                        result.outcome === "unavailable"
                          ? undefined
                          : result.id === "hotspot" ||
                              result.id === "temperature"
                            ? "/demo-thermal.svg"
                            : "/demo-gauge.svg"
                      }
                      unavailableReason="No evidence delivered for this result."
                    />
                    <a href="/maintenance-planning.html">
                      Prepare an intervention ↗
                    </a>
                    <p className="muted">
                      Work completion, result assessment and verified resolution
                      remain separate.
                    </p>
                  </MeasurementCard>
                )}
              </div>
            </>
          )}
        </section>
      )}
      <p className="gis-footer">
        The shared API header applies to connected examples. This application
        keeps its demonstration data local. Adapt workflow node outputs or your
        maintenance system into these display components; selection never
        dispatches a command.
      </p>
    </main>
  );
}
createRoot(document.getElementById("app")!).render(<App />);
