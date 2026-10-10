import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MissionCatalog } from "./mission-catalog.tsx";
import { ConnectedWorkbench, downloadJson } from "./workbench-connection.tsx";
import {
  aerialPreview,
  initialAerialDraft,
  routePosition,
  type AerialDraft,
  type Aircraft,
} from "./aerial-domain.ts";
import { createGis } from "./gis.ts";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "@cyberwave/react/styles.css";
import "./workbench.css";
function App() {
  const [draft, setDraft] = useState<AerialDraft>(initialAerialDraft),
    [fraction, setFraction] = useState(0),
    [playing, setPlaying] = useState(false);
  const result = useMemo(() => aerialPreview(draft), [draft]),
    container = useRef<HTMLDivElement>(null),
    map = useRef<ReturnType<typeof createGis>>(null);
  const anchor = { longitude: 9.12, latitude: 45.08, height: 0, yawDegrees: 0 };
  useEffect(() => {
    if (!container.current) return;
    const view = createGis(
      container.current,
      anchor,
      () => {},
      () => {},
    );
    map.current = view;
    return () => view.destroy();
  }, []);
  useEffect(() => {
    setPlaying(false);
    setFraction(0);
  }, [draft]);
  useEffect(() => {
    const p = routePosition(result.points, fraction);
    const rect = (cx: number, cy: number, w: number, h: number) =>
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([x, y]) => ({ x: cx + (x * w) / 2, y: cy + (y * h) / 2, z: 1 }));
    map.current?.setOverlays(
      result.points.length
        ? [
            {
              name: "Synthetic survey area",
              points: rect(0, 0, draft.widthM, draft.lengthM),
              color: "#38bdf8",
            },
            ...(draft.takeoff === "runway" || draft.landing === "runway"
              ? [
                  {
                    name: "Illustrative runway",
                    points: rect(-draft.widthM / 2 - 60, 0, 15, draft.runwayM),
                    color: "#efb765",
                  },
                ]
              : []),
          ]
        : [],
    );
    map.current?.update(
      p
        ? [{ uuid: "preview-aircraft", name: "Kinematic cursor", position: p }]
        : [],
      [],
      {
        points: result.points.map((position, i) => ({
          id: `lane-${i}`,
          name: `Point ${i + 1}`,
          position,
        })),
        revision: 0,
      },
    );
  }, [result, fraction, draft]);
  useEffect(() => {
    if (!playing) return;
    let frame: number,
      last = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - last) / 1000;
      last = now;
      setFraction((f) => {
        const next = Math.min(1, f + elapsed / 30);
        if (next === 1) setPlaying(false);
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  function update<K extends keyof AerialDraft>(key: K, value: AerialDraft[K]) {
    setDraft({ ...draft, [key]: value });
  }
  function aircraft(value: Aircraft) {
    setDraft({
      ...draft,
      aircraft: value,
      speedMps: value === "multirotor" ? 8 : 20,
      takeoff: value === "fixed-wing" ? "runway" : "vertical",
      landing: value === "fixed-wing" ? "runway" : "vertical",
    });
  }
  const artifact = {
    schema: "cyberwave.example.aerial-draft.v1",
    status: "draft-needs-validation",
    objective: draft.objective,
    reference: {
      horizontal: "local ENU",
      anchor,
      vertical: "flat-ground illustration only",
    },
    requirements: draft,
    coverage: result.points,
    validation: { dispatchable: false, issues: result.issues },
  };
  return (
    <main className="studio">
      <div className="studio-heading">
        <div>
          <span className="studio-kicker">MISSION DESIGN / GIS</span>
          <h1>Plan the objective. Check the aircraft.</h1>
          <p>
            Crop coverage, thermal observation and runway operations in one
            custom interface.
          </p>
        </div>
        <span className="tag amber">Draft · no flight dispatch</span>
      </div>
      <div className="workbench-grid">
        <aside className="panel">
          <h2>Inspection objective</h2>
          <div className="fields">
            <label className="span-2">
              Scenario
              <select
                value={draft.objective}
                onChange={(e) =>
                  update(
                    "objective",
                    e.target.value as AerialDraft["objective"],
                  )
                }
              >
                <option value="crop-survey">
                  Crop survey · RGB / multispectral
                </option>
                <option value="thermal-observation">
                  Thermal observation · potential hotspots
                </option>
              </select>
            </label>
            <label className="span-2">
              Aircraft
              <select
                value={draft.aircraft}
                onChange={(e) => aircraft(e.target.value as Aircraft)}
              >
                <option value="multirotor">Multirotor</option>
                <option value="fixed-wing">Fixed-wing · runway</option>
                <option value="vtol">Hybrid VTOL</option>
              </select>
            </label>
            {(
              [
                ["widthM", "Area width · m"],
                ["lengthM", "Area length · m"],
                ["altitudeM", "Height · m"],
                ["speedMps", "Survey speed · m/s"],
                ["cameraFovDegrees", "Cross-track FOV · °"],
                ["overlap", "Side overlap · 0–0.94"],
                ["enduranceMinutes", "Endurance · min"],
                ["reservePercent", "Energy reserve · %"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  step="any"
                  value={draft[key]}
                  onChange={(e) => update(key, e.target.valueAsNumber)}
                />
              </label>
            ))}
            <label className="span-2">
              Altitude reference
              <select
                value={draft.altitudeReference}
                onChange={(e) =>
                  update(
                    "altitudeReference",
                    e.target.value as AerialDraft["altitudeReference"],
                  )
                }
              >
                <option value="AGL">AGL · assumed flat ground</option>
                <option value="AMSL">AMSL · requires terrain + datum</option>
                <option value="ELLIPSOID">
                  Ellipsoid · requires terrain + datum
                </option>
              </select>
            </label>
            {draft.aircraft !== "multirotor" && (
              <>
                <label>
                  Launch
                  <select
                    value={draft.takeoff}
                    onChange={(e) =>
                      update(
                        "takeoff",
                        e.target.value as AerialDraft["takeoff"],
                      )
                    }
                  >
                    <option value="vertical">Vertical</option>
                    <option value="runway">Runway</option>
                    <option value="catapult">Catapult / hand launch</option>
                  </select>
                </label>
                <label>
                  Recovery
                  <select
                    value={draft.landing}
                    onChange={(e) =>
                      update(
                        "landing",
                        e.target.value as AerialDraft["landing"],
                      )
                    }
                  >
                    <option value="vertical">Vertical</option>
                    <option value="runway">Runway</option>
                    <option value="recovery">Dedicated recovery system</option>
                  </select>
                </label>
                {(
                  [
                    ["runwayM", "Available runway · m"],
                    ["requiredRunwayM", "Required runway · m"],
                    ["bankDegrees", "Illustrative bank · °"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      value={draft[key]}
                      onChange={(e) => update(key, e.target.valueAsNumber)}
                    />
                  </label>
                ))}
              </>
            )}
            <label className="span-2">
              Requested start · ISO with UTC offset
              <input
                value={draft.startAt}
                placeholder="2026-11-01T09:00:00+01:00"
                onChange={(e) => update("startAt", e.target.value)}
              />
            </label>
          </div>
          <p className="muted compact">
            Aircraft values are illustrative. Supply a verified performance
            profile before operational validation.
          </p>
        </aside>
        <section className="panel">
          <div className="toolbar">
            <span className="tag">Cesium · synthetic survey area</span>
            <button
              className="cw-button"
              onClick={() => map.current?.focusRoute()}
            >
              Fit route
            </button>
          </div>
          <div className="workbench-map" ref={container} />
          <div className="metric-row">
            <div>
              <strong>{(result.distanceM / 1000).toFixed(2)} km</strong>
              <span>Survey lines + straight connectors</span>
            </div>
            <div>
              <strong>{result.durationMinutes.toFixed(1)} min</strong>
              <span>Survey-only estimate</span>
            </div>
            <div>
              <strong>{result.laneSpacingM.toFixed(1)} m</strong>
              <span>Lane spacing</span>
            </div>
            {result.turnRadiusM > 0 && (
              <div>
                <strong>{result.turnRadiusM.toFixed(0)} m</strong>
                <span>Estimated turn radius</span>
              </div>
            )}
          </div>
          <div className="plan-steps">
            {[
              "Objective",
              "Coverage",
              "Launch + transit",
              "Survey",
              "Recovery",
              "Evidence review",
            ].map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
          <div className="toolbar">
            <button
              className="cw-button cw-primary"
              disabled={!result.points.length}
              onClick={() => {
                if (fraction === 1) setFraction(0);
                setPlaying(!playing);
              }}
            >
              {playing ? "Pause preview" : "Simulate survey cursor"}
            </button>
            <button
              className="cw-button"
              onClick={() => {
                setPlaying(false);
                setFraction(0);
              }}
            >
              Reset
            </button>
            <button
              className="cw-button"
              disabled={!result.points.length}
              onClick={() =>
                downloadJson("aerial-inspection-draft.json", artifact)
              }
            >
              Export draft
            </button>
          </div>
          <input
            aria-label="Survey preview progress"
            className="sim-progress"
            type="range"
            min="0"
            max="1"
            step=".001"
            value={fraction}
            onChange={(e) => {
              setPlaying(false);
              setFraction(Number(e.target.value));
            }}
          />
          <p className="muted compact">
            30-second kinematic preview. The cursor follows straight segments;
            aircraft dynamics, turns, takeoff and landing are not simulated. The
            map uses a synthetic flat reference, not surveyed terrain.
          </p>
          <h3>Before this becomes an executable mission</h3>
          <ul className="issues">
            {result.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          <details>
            <summary>Inspect portable draft</summary>
            <pre className="draft-code">
              {JSON.stringify(artifact, null, 2)}
            </pre>
          </details>
        </section>
      </div>
      <section className="section-gap">
        <h2>Connect your existing Cyberwave missions</h2>
        <ConnectedWorkbench>
          {(client) => <MissionCatalog key={client.baseUrl} client={client} />}
        </ConnectedWorkbench>
      </section>
    </main>
  );
}
createRoot(document.getElementById("app")!).render(<App />);
