# Component opportunities from the example review

Review scope: all 19 developer-console entries, SDK guides, TypeScript recipes,
annotation/training instructions and the related Mintlify SDK, evidence and
governance pages. The [example catalog](../examples/developer-console/README.md#choose-a-runnable-path)
records each page's prerequisites, source and effects. This document proposes next
increments; the names below are **not existing SDK exports**.

## Completed increment: dataset browsing

`DatasetSampleBrowser` now ships from `@cyberwave/react` and is reused in examples 14/15. It follows `next_after`, filters approved samples, handles errors and source changes, and resets cursors on collection/account changes. The annotation journey locks navigation while edits are pending and refreshes after a successful revisioned review. [Integration and ownership](../packages/react/README.md#browse-dataset-evidence).

## Prioritize complete journeys

| Priority / proposed component | Observed gap | Reuse / smallest increment | Acceptance boundary |
| --- | --- | --- | --- |
| 1 · `EnvironmentTwinPicker` | Examples 16/17 have a shared environment/twin chooser that exists only inside the example. Other applications must recreate that loading and reset logic. | Extract [SensorWorkbench](../examples/developer-console/src/sensor-workbench.tsx) selection using `EnvironmentBrowser`, `environments.twins` and the existing `SensorSelector`; keep viewer/commands as children. | Client/environment changes remove old twins, sensor choice and active child views; delayed responses cannot restore them. Selection never activates a controller. No backend changes. |
| 1 · `HumanActionInbox` | The action list, decision/detail state and resume UI are embedded in example 14; photo actions still open the platform inbox. | Extract list/detail/response views over `humanActions`; compose existing image capture for photos and host-owned Attachment upload. | Respect backend assignee, deadline and source-change errors. An accepted response is distinct from successful workflow continuation; link its execution. Never auto-approve or resend a different answer. |
| 2 · Extend `CapturedFrameReview` with a sample handoff composition | Examples 15/16 can review a frame, but choosing a collection and attaching reviewed evidence requires host code. | Combine the existing frame review with host-owned collection selection, `DatasetSampleBrowser` and an application callback; share a recipe before creating another component. | Retain original twin/sensor/run/time, Attachment/sample UUID and digest. Reconcile partial uploads; a cancelled wait must not imply rollback. Human consent and label approval stay separate. |
| 2 · `InspectionComparison` | Example 09 contains useful before/after uncertainty logic; example 19 exposes stored history but no comparison view. | Existing `evidence.history`, observation details, evidence previews and [comparison rules](../examples/developer-console/src/inspection-domain.ts). Extract a read-only pair view with host-selected observations. | Same stable defect/reference; mismatched units, missing calibration or missing coverage stay non-comparable. Never infer resolution from non-observation. No pixel-to-metre guesses. |
| 2 · Extend `WorkflowMonitor` with a task timeline | Execution, human waits and inspection results appear on separate screens. A developer needs to explain what is waiting and what to do next. | Add optional render slots/links for existing node executions and outputs. Use application-provided human-action/evidence references; keep native statuses. | No new global activity store. Chronology uses backend times; missing correlation stays explicit. Pause monitoring is distinct from cancelling execution. |
| 3 · `RecordedClipSelection` | Recording playback has a cursor, while Episode selection is a server recipe. Selecting a training interval is not yet a UI journey. | Extend `RecordingPlaybackPanel` with explicit in/out callbacks and `mediaSecondsToTimestampUs`; use existing Episode/Dataset APIs through the host. | Validate selected source clock and coverage, preserve source ID, and show processing readiness. Do not claim synchronized multi-camera/3D replay. |

The first two are the best next implementation: they remove repeated integration
work and connect existing selection and human-action flows without duplicating their APIs. Implement one component,
use it in at least two current pages, then verify stale requests, empty catalogs,
permission errors and selection changes. Avoid adding another example page until
it demonstrates a new journey that existing pages cannot show clearly.

## Compose around an operator's next action

- **Industrial rounds:** choose an asset → watch/capture → review a reading → append
  selected evidence → schedule a verification workflow. Reuse the result and
  measurement components; source adapters provide units and assessment.
- **Maintenance:** map → persistent finding → compare campaigns → prepare an
  intervention → inspect the verification run. Keep work-order acknowledgement
  and technical resolution separate.
- **Human field work:** open assigned action → capture a photo or decide → submit
  once → monitor the resumed run. Reuse the workflow checkpoint and Attachment.
- **Training curation:** browse collection → inspect the next sample → review
  labels → export approved samples with provenance. Pagination and dirty-review
  handling are more valuable now than a new training dashboard.

## Backend-dependent ideas to keep separate

A workspace-wide condition map needs a permission-scoped, paginated portfolio
projection; browser fan-out over every environment/campaign cannot establish the
current authoritative state. Grounding image regions on a map needs capture pose,
calibration, terrain/depth and reference versions. One-off appointments, exclusive
resource claims, enforced spending caps and correlated child completion require
backend semantics before a UI can promise them. Extend the existing geo,
workflow, accounting or inspection service when implementing those cases.

A stream health panel could eventually combine producer presence, source/run
identity and transport diagnostics. Today a declared camera, a connected viewer
and a decoded frame are distinct facts; no authoritative active-producer discovery
contract is advertised. Improve those states in `SensorVideoPanel` before building
a second monitoring service or inferring health from catalog membership.

## Review changes and verification

The review corrected stale streaming/inspection claims, exposed the two example
connection boundaries, documented sample browsing limits, and added a component
reference plus a compiled React composition. Navigation, Vite entries, in-page
guidance and the generated example table now share one catalog checked during the
build. These checks catch missing pages/source links and catalog drift; they do
not prove an external producer, recording, training worker or flight is available.

Named dataset/model browsing now reuses the existing generated list routes. `ModelInputSummary` and `ImageModelTaskControls` consume backend contracts. Global catalog search and a general custom-model multimodal form remain separate gaps; page filters and structured image controls do not claim those capabilities.
