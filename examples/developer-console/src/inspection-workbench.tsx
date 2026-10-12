import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { RecordingVideo } from "@cyberwave/react";
import {
  compareObservations,
  demoFindings,
  reviewFinding,
  type Finding,
} from "./inspection-domain.ts";
import { downloadJson } from "./workbench-connection.tsx";
import { InspectionPersistence } from "./inspection-persistence.tsx";
import "@cyberwave/react/styles.css";
import "./workbench.css";
function App() {
  const [findings, setFindings] = useState(() => structuredClone(demoFindings)),
    [id, setId] = useState("DF-101"),
    [filter, setFilter] = useState("all"),
    [reason, setReason] = useState(""),
    [message, setMessage] = useState(""),
    [url, setUrl] = useState(""),
    [campaign, setCampaign] = useState(1);
  const videoBox = useRef<HTMLDivElement>(null),
    finding = findings.find((f) => f.id === id)!,
    comparison = compareObservations(
      finding.observations[0],
      finding.observations[1],
    ),
    observation = finding.observations[campaign];
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  function review(decision: "validated" | "rejected") {
    try {
      setFindings(
        findings.map((f) =>
          f.id === id
            ? reviewFinding(f, decision, reason, new Date().toISOString())
            : f,
        ),
      );
      setReason("");
      setMessage("Local review recorded. Export to retain this session.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function change<K extends keyof Finding>(key: K, value: Finding[K]) {
    setFindings(
      findings.map((f) =>
        f.id === id ? { ...f, [key]: value, review: "proposed" } : f,
      ),
    );
    setMessage("Changed finding; a new review is required.");
  }
  const visible = findings.filter(
    (f) => filter === "all" || f.review === filter,
  );
  return (
    <main className="studio">
      <div className="studio-heading">
        <div>
          <span className="studio-kicker">
            INSPECTION / EVIDENCE & CONDITION
          </span>
          <h1>One defect. A history of observations.</h1>
          <p>
            Review imported inspection evidence without requiring an active
            robot or a 3D reconstruction.
          </p>
        </div>
        <span className="tag amber">Synthetic data · local draft</span>
      </div>
      <div className="metric-row">
        <div>
          <strong>600 m</strong>
          <span>North culvert · synthetic linear asset</span>
        </div>
        <div>
          <strong>2</strong>
          <span>Inspection campaigns</span>
        </div>
        <div>
          <strong>
            {findings.filter((f) => f.review === "validated").length} /{" "}
            {findings.length}
          </strong>
          <span>Validated defects</span>
        </div>
        <div>
          <strong>68%</strong>
          <span>Follow-up coverage · incomplete</span>
        </div>
      </div>
      <div className="workbench-grid">
        <aside className="panel">
          <h2>Defect register</h2>
          <div className="fields">
            <label className="span-2">
              Review status
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All findings</option>
                <option value="proposed">Proposed</option>
                <option value="validated">Validated</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
          </div>
          <div className="cw-resource-list section-gap">
            {visible.map((f) => (
              <button
                key={f.id}
                className={`cw-resource ${id === f.id ? "cw-selected" : ""}`}
                onClick={() => {
                  setId(f.id);
                  setMessage("");
                  setReason("");
                }}
              >
                <span>
                  <strong>{f.name}</strong>
                  <small>
                    {f.id} · chainage {f.chainageM} m
                  </small>
                  <small>
                    {f.review} · {f.severity}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <p className="note">
            Follow-up delivery has a coverage gap from 408–600 m. Unobserved
            defects remain open for assessment; the campaign is not fully
            accepted.
          </p>
          <a className="studio-link" href="/recording-review.html">
            Open Cyberwave recordings ↗
          </a>
        </aside>
        <section className="panel">
          <div className="toolbar">
            <span className="tag">{finding.id}</span>
            <h2 style={{ margin: 0 }}>{finding.name}</h2>
            <span className="tag amber">{finding.review}</span>
          </div>
          <div className="evidence-layout">
            <div>
              <svg
                className="defect-map"
                viewBox="0 0 600 225"
                role="img"
                aria-label="Synthetic culvert plan showing inspected sections, missing coverage and selected defect"
              >
                <defs>
                  <pattern
                    id="hatch"
                    width="12"
                    height="12"
                    patternUnits="userSpaceOnUse"
                  >
                    <path d="M0 12L12 0" stroke="#705630" />
                  </pattern>
                </defs>
                <text x="30" y="30" fill="#a5bdcf" fontSize="12">
                  LINEAR REFERENCE / SYNTHETIC PLAN v1
                </text>
                <rect
                  x="30"
                  y="65"
                  width="540"
                  height="90"
                  rx="12"
                  fill="#20364b"
                />
                <rect
                  x="397"
                  y="65"
                  width="173"
                  height="90"
                  fill="url(#hatch)"
                />
                <path d="M30 110H570" stroke="#70b6d3" strokeDasharray="6 6" />
                {findings.map((f) => (
                  <g key={f.id}>
                    <circle
                      cx={30 + f.chainageM * 0.9}
                      cy="110"
                      r={f.id === id ? 12 : 7}
                      fill={f.id === id ? "#38bdf8" : "#e2b25f"}
                    />
                    <text
                      x={30 + f.chainageM * 0.9}
                      y="185"
                      textAnchor="middle"
                      fill="#a3b6c8"
                      fontSize="12"
                    >
                      {f.chainageM} m
                    </text>
                  </g>
                ))}
                <text x="410" y="55" fill="#d7b981" fontSize="11">
                  Coverage unavailable
                </text>
              </svg>
              <p className="muted compact">
                Location: chainage {finding.chainageM} m · surface position
                unknown · reference v1. This diagram is not photographic
                evidence.
              </p>
              <div className="comparison">
                {finding.observations.map((o, i) => (
                  <article key={o.campaign}>
                    <h3>{o.campaign}</h3>
                    <strong>
                      {o.observed
                        ? `${o.value} ${o.unit}${o.uncertainty !== undefined ? ` ± ${o.uncertainty}` : ""}`
                        : "Not observed"}
                    </strong>
                    <p className="muted compact">
                      {o.limitation || "Illustrative calibrated measurement"}
                    </p>
                    <p className="muted compact">
                      Model {o.modelVersion}
                      <br />
                      AI confidence{" "}
                      {o.observed
                        ? `${Math.round(o.confidence * 100)}%`
                        : "N/A"}
                    </p>
                    <button
                      className="cw-button"
                      onClick={() => setCampaign(i)}
                    >
                      Inspect evidence
                    </button>
                  </article>
                ))}
              </div>
              <p className="note">
                <strong>{comparison.status}</strong>
                <br />
                {comparison.reason}
              </p>
            </div>
            <div>
              <h3>Technical assessment</h3>
              <div className="fields">
                <label>
                  Severity
                  <select
                    value={finding.severity}
                    onChange={(e) =>
                      change("severity", e.target.value as Finding["severity"])
                    }
                  >
                    {["low", "medium", "high"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Maintenance priority
                  <select
                    value={finding.priority}
                    onChange={(e) =>
                      change("priority", e.target.value as Finding["priority"])
                    }
                  >
                    {["routine", "planned", "urgent"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className="span-2">
                  Technical state
                  <select
                    value={finding.technical}
                    onChange={(e) =>
                      change(
                        "technical",
                        e.target.value as Finding["technical"],
                      )
                    }
                  >
                    {["new", "stable", "worsened", "not-assessable"].map(
                      (v) => (
                        <option key={v}>{v}</option>
                      ),
                    )}
                  </select>
                </label>
                <label className="span-2">
                  Review reason
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Explain the evidence and any limitation…"
                  />
                </label>
              </div>
              <div className="toolbar">
                <button
                  className="cw-button cw-primary"
                  onClick={() => review("validated")}
                >
                  Validate
                </button>
                <button
                  className="cw-button"
                  onClick={() => review("rejected")}
                >
                  Reject
                </button>
              </div>
              <p className="status-line" role="status">
                {message}
              </p>
              <p className="muted compact">
                Resolution requires verification evidence. Closing a maintenance
                order alone cannot resolve this defect.
              </p>
              <div className="review-log">
                {finding.revisions.map((r, i) => (
                  <p key={i}>
                    {r.decision} · {r.at}
                    <br />
                    {r.reason}
                  </p>
                ))}
              </div>
            </div>
          </div>
          <div className="section-gap">
            <h3>{observation.campaign} evidence adapter</h3>
            <p className="muted compact">
              Attach a local video to exercise the player. It stays in your
              browser and is not asserted to depict the synthetic defect.
              Production evidence should use the recording catalog and immutable
              evidence IDs.
            </p>
            <input
              aria-label="Local evidence video"
              type="file"
              accept="video/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setUrl(f ? URL.createObjectURL(f) : "");
              }}
            />
            {url && (
              <div ref={videoBox} className="section-gap">
                <RecordingVideo src={url} />
                <button
                  className="cw-button"
                  onClick={() => {
                    const video = videoBox.current?.querySelector("video");
                    if (video && Number.isFinite(video.duration))
                      video.currentTime = Math.min(
                        observation.evidenceSeconds,
                        video.duration,
                      );
                  }}
                >
                  Seek example evidence · {observation.evidenceSeconds}s
                </button>
              </div>
            )}
          </div>
          <div className="toolbar">
            <button
              className="cw-button"
              onClick={() =>
                downloadJson("inspection-review-draft.json", {
                  schema: "cyberwave.example.inspection.v1",
                  synthetic: true,
                  asset: "north-culvert-demo",
                  coverage: { baseline: 1, followUp: 0.68, accepted: false },
                  findings,
                })
              }
            >
              Export review session
            </button>
            <button
              className="cw-button"
              disabled={!findings.some((f) => f.review === "validated")}
              onClick={() =>
                downloadJson("validated-inspection-handoff.json", {
                  schema: "cyberwave.example.maintenance-handoff.v1",
                  synthetic: true,
                  status: "not-submitted",
                  externalSystem: "application-owned adapter required",
                  findings: findings.filter((f) => f.review === "validated"),
                })
              }
            >
              Export validated handoff
            </button>
          </div>
          <p className="note">
            The editor above is a local draft. Use the backend panel below to
            persist the synthetic campaigns and a reviewed assessment; source
            evidence and server review history remain separate.
          </p>
        </section>
      </div>
      <InspectionPersistence finding={finding} />
    </main>
  );
}
createRoot(document.getElementById("app")!).render(<App />);
