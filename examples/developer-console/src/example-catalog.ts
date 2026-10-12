/** Navigation, in-page guidance and the generated example guide share this catalog. */
export type Example = {
  id: number;
  title: string;
  group: string;
  path: string;
  source: string;
  data: string;
  setup: string;
  actions: string;
  reuse: string;
};
export const examples: Example[] = [
  {
    id: 18,
    title: "Asset operations map",
    group: "Asset operations & GIS",
    path: "/asset-operations.html",
    source: "asset-operations.tsx",
    data: "Invented sites and activity results",
    setup:
      "No API credentials. Optional OpenStreetMap tiles need network access.",
    actions: "Local selection and JSON export only.",
    reuse: "LocationMap, ActivityResults, MeasurementCard, EvidencePreview",
  },
  {
    id: 19,
    title: "Inspection atlas",
    group: "Asset operations & GIS",
    path: "/inspection-atlas.html",
    source: "inspection-atlas.tsx",
    data: "API selected in the header",
    setup:
      "Authorized environment; inspection endpoints and stored campaigns. A geo anchor is optional.",
    actions:
      "Read-only campaign/review/recording browsing; media references need a host resolver.",
    reuse:
      "EnvironmentBrowser, EvidenceCollectionBrowser, EvidenceRecordDetails, RecordingPlaybackPanel",
  },
  {
    id: 16,
    title: "Sensor video",
    group: "Video & telemetry",
    path: "/sensor-video.html",
    source: "sensor-video.tsx",
    data: "API selected in the header and an active camera producer",
    setup:
      "Authenticated local API, video routes, reachable SFU and exact twin/sensor/source/stream instance.",
    actions:
      "Explicit viewer negotiation and teardown; PNG/annotation exports stay local. Does not start a producer.",
    reuse: "SensorVideoPanel, CapturedFrameReview",
  },
  {
    id: 17,
    title: "Sensor telemetry",
    group: "Video & telemetry",
    path: "/sensor-telemetry.html",
    source: "sensor-telemetry.tsx",
    data: "API history; optional local MQTT bridge",
    setup:
      "Stored sensor-tagged events for history. Live reads also need server-configured MQTT and the matching authenticated local API.",
    actions:
      "REST reads; explicit live subscribe/disconnect. Neither starts a producer nor persists packets.",
    reuse: "SensorSelector, SensorTelemetryPanel, LiveSensorTelemetryPanel",
  },
  {
    id: 14,
    title: "Human actions & evidence",
    group: "Human review & training",
    path: "/human-evidence.html",
    source: "human-evidence.tsx",
    data: "API selected in the header",
    setup:
      "Preview human-action and dataset-sample routes; assigned action or a visible media collection.",
    actions:
      "Explicit consent/acknowledgement writes to authenticated local APIs. Photo upload uses the platform inbox; sample browsing uses backend pagination and an approved-only filter.",
    reuse:
      "DatasetBrowser, DatasetSampleBrowser, humanActions, datasets; custom action/detail UI",
  },
  {
    id: 15,
    title: "Capture & annotation",
    group: "Human review & training",
    path: "/image-annotation.html",
    source: "image-annotation.tsx",
    data: "Local image/camera or API dataset sample",
    setup:
      "Local image works without API credentials. Sample review and model assistance need the matching backend.",
    actions:
      "Local drawing/export; explicit local-backend review or model run. Inference may consume credits. Choose datasets and models by name, then a sample and backend image task. Save or discard label edits before changing images.",
    reuse:
      "DatasetBrowser, DatasetSampleBrowser, ModelBrowser, ImageModelTaskControls, ImageAnnotationEditor, ImageCapture, ModelResultOverlay",
  },
  {
    id: 1,
    title: "Environment explorer",
    group: "SDK components",
    path: "/environments.html",
    source: "environment-browser.tsx",
    data: "API selected in the header",
    setup: "Authorized environment and accessible model resources.",
    actions:
      "Read-only environment/model loading; scene gestures do not issue commands.",
    reuse:
      "EnvironmentBrowser, EnvironmentSummary, loadEnvironment, environment-3d",
  },
  {
    id: 2,
    title: "Real asset studio",
    group: "SDK components",
    path: "/asset-catalog.html",
    source: "environment-browser.tsx",
    data: "API selected in the header",
    setup:
      "Public catalog or authorized private assets; accessible model resources.",
    actions: "Read-only asset loading; joint motion is a local preview.",
    reuse: "AssetBrowser, assetModel, environment-3d",
  },
  {
    id: 3,
    title: "Cesium GIS & navigation drafts",
    group: "Visualization",
    path: "/",
    source: "main.ts",
    data: "Server fixture or server-configured local target",
    setup:
      "Fixture mode works without credentials. Connected navigation requires explicit execution and geo-verification settings.",
    actions:
      "Local route draft; Start can dispatch navigation only when enabled on the server. Header API does not retarget commands.",
    reuse: "Generated REST client; example draft/coordinate adapters",
  },
  {
    id: 4,
    title: "Twin & camera monitor",
    group: "Visualization",
    path: "/twin-monitor.html",
    source: "twin-monitor.ts",
    data: "Server fixture or server-configured local target",
    setup:
      "Fixture mode or a configured environment/twin; camera snapshots need an active source.",
    actions: "Read-only REST snapshots. This is not the WebRTC viewer.",
    reuse: "Generated REST client; example snapshot adapter",
  },
  {
    id: 5,
    title: "Route timeline · kinematic",
    group: "Simulation",
    path: "/mission-simulation.html",
    source: "mission-simulation.ts",
    data: "Server fixture or local API snapshot; local animation",
    setup: "Default fixture, or the server-configured environment.",
    actions:
      "Play/pause/seek a kinematic route; no backend run or command is created.",
    reuse: "Example sampleRoute and immutable poses",
  },
  {
    id: 6,
    title: "Robot environment & runtime modes",
    group: "Simulation",
    path: "/robot-environment.html",
    source: "robot-environment.ts",
    data: "Catalog mesh; server-configured observations and controller",
    setup:
      "Fixture preview, or local environment/policy/MQTT. Physics start additionally requires a compatible simulation worker.",
    actions:
      "Explicit controller activation; optional bounded backend simulation start/owned stop. Live selection observes the configured twin.",
    reuse: "environment-3d; example controller and simulation adapters",
  },
  {
    id: 7,
    title: "Keyboard controller input",
    group: "Command & control",
    path: "/keyboard-telecontrol.html",
    source: "keyboard-telecontrol.ts",
    data: "Server fixture or server-configured simulation controller",
    setup:
      "Fixture preview, or an assigned simulation-only velocity policy and local broker.",
    actions:
      "Activation + Space/WASD/QE produce bounded intent. Live actuation is not enabled by the API header.",
    reuse: "Example keyboard compiler and controller ownership/expiry",
  },
  {
    id: 11,
    title: "Workflows & schedules",
    group: "Planning & governance",
    path: "/mission-library.html",
    source: "mission-library.tsx",
    data: "API selected in the header",
    setup:
      "Workspace/environment access; workflow templates and preview input-contract/pagination routes.",
    actions:
      "Local-backend draft/configuration, activation, recurring schedule, run and cancellation.",
    reuse: "WorkflowCatalog, WorkflowPlanner, WorkflowMonitor",
  },
  {
    id: 12,
    title: "Maintenance planning",
    group: "Maintenance",
    path: "/maintenance-planning.html",
    source: "maintenance-planning.tsx",
    data: "Synthetic proposal plus API findings/workflows",
    setup:
      "Local proposal needs no private data. Stored findings/workflow planning need an authorized environment.",
    actions:
      "JSON export is local. The embedded planner can change/run workflows independently; no work order or reservation is submitted.",
    reuse: "EvidenceCollectionBrowser, useEvidenceCollection, WorkflowCatalog",
  },
  {
    id: 13,
    title: "Maintenance verification",
    group: "Maintenance",
    path: "/maintenance-verification.html",
    source: "maintenance-verification.tsx",
    data: "Synthetic reconciliation plus API stored verification",
    setup:
      "Local walkthrough or stored baseline/follow-up evidence on the preview backend.",
    actions:
      "Local acceptance exercise; explicit stored review/import and workflow actions can write to the authenticated local API.",
    reuse: "EvidenceVerificationPanel, workflow components",
  },
  {
    id: 8,
    title: "Aerial inspection planning",
    group: "Inspection & GIS",
    path: "/aerial-inspection.html",
    source: "aerial-inspection.tsx",
    data: "Synthetic survey; optional API workflow panel",
    setup:
      "No credentials for planning. Workflow panel needs the matching backend.",
    actions:
      "Survey export and kinematic preview; no flight upload. Embedded workflow controls are separate real actions.",
    reuse: "Example aircraft/coverage checks; workflow components",
  },
  {
    id: 9,
    title: "Campaign & evidence review",
    group: "Inspection & GIS",
    path: "/inspection-workbench.html",
    source: "inspection-workbench.tsx",
    data: "Synthetic comparison plus optional API persistence",
    setup:
      "Local walkthrough; authenticated local inspection API for imports/reviews.",
    actions:
      "Local review/export or explicit synthetic campaign import and stored review. Local video selection does not upload it.",
    reuse: "RecordingVideo; inspection helpers and example comparison logic",
  },
  {
    id: 10,
    title: "Recording catalog & playback",
    group: "Inspection & GIS",
    path: "/recording-review.html",
    source: "recording-review.tsx",
    data: "API selected in the header",
    setup:
      "Authorized environment and stored recordings; finalized MP4/known source clock for video.",
    actions:
      "Catalog/source reads and media playback; HTTP 202 means preparation, not a missing recording.",
    reuse: "RecordingBrowser, RecordingPlaybackPanel",
  },
];
