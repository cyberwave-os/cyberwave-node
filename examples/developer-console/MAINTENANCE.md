# Maintenance with existing Cyberwave primitives

Use a workflow to perform an activity, a run to record execution, and a recurring trigger to plan repeated activity. Keep work orders in the existing maintenance system. Inspection campaigns and observations preserve evidence independently of whether a robot acquired it.

## Try the examples

1. Open [Maintenance planning](http://127.0.0.1:5173/maintenance-planning.html). Complete the parts/access checks for the preventive pump example. Move its start to `2026-11-03T09:30:00Z` to see a sample crew conflict; the adjacent 10:00 window passes. These fixed dates and reservations are synthetic.
2. Use **API** in the header to connect to the branch backend. Select an environment and campaign. Link a finding with a validated latest review. If none exist, use [Campaign review](http://127.0.0.1:5173/inspection-workbench.html) to import synthetic campaigns and record a reasoned review locally. A missing inspection endpoint is reported rather than replaced by invented backend data.
3. Choose a workflow or clone a template in the same environment. Configure the template's declared inputs, then run now or enable recurring timing. The proposal export can link this workflow, but the proposed crew window does not configure its schedule or prevent execution. The workflow planner uses its existing backend validation and authorization.
4. Export the proposal. Repeating an export of unchanged data retains the exchange key. Editing the proposal or workflow reference advances its revision. The export carries source origin and exact campaign/defect/observation/review identifiers. It is a snapshot, not a command, approval or durable outbox entry.
5. Open [Maintenance verification](http://127.0.0.1:5173/maintenance-verification.html). This separate synthetic scenario uses its own fixed exchange key; it does not ingest the previous export. Apply the same work-order update twice, then prepare and apply a completion update. Condition remains unverified. Fill the synthetic evidence and record the local assessment: a covered defect can resolve while the 68% delivery still needs rework. Change coverage to 100% and reassess to make the delivery ready for acceptance review.
6. Use the recording and campaign links to inspect real evidence, or the workflow planner below to arrange a verification visit. The synthetic verification references are not validated against those APIs and do not close any backend defect. Export before switching API or navigating away; application drafts live only in memory.

## Scenarios and ownership

| Scenario | Existing Cyberwave reuse | Application / maintenance-system responsibility |
| --- | --- | --- |
| Preventive pump inspection | Template with asset/robot/waypoint inputs → recurring workflow → run and recordings | Maintenance interval, due date, crew, isolation/access and tools. A periodic cron is not a reserved appointment. |
| Corrective infrastructure repair | Validated observation, stable defect identity and review revision → evidence acquisition or follow-up workflow | BU asset mapping, responsible team, explained priority and external work order. AI confidence, technical severity and maintenance priority stay separate. |
| Manufacturing shutdown / conveyor check | Environment-scoped schedules and execution history; selected capability or subworkflow | Shutdown window, human work, spares, capacity and dependencies. A UI overlap check is not a concurrent resource claim. |
| Verification after intervention | New inspection campaign, recordings and immutable observation/review history | Link the intervention to evidence and an authorized expert decision. Work completion alone cannot establish resolution. |
| Supplier delivery with partial coverage | Campaign coverage and limitations; evidence independent of fleet execution | Expected scope, acceptance/rework, deadlines and phase timing. Complete evidence can document a persistent defect; acceptance does not require every defect to disappear. |

For a multi-site portfolio, query workflows at workspace scope and drill into the owning environment. The current campaign API is environment-scoped. The maintenance example deliberately loads one selected campaign at a time, not every campaign in every site; it does not claim to be an authoritative current defect register. A later portfolio projection should be permission-scoped and paginated server-side.

## Minimum integration contract

- **Proposal / handoff:** BU + official asset reference, purpose and work description, owner, priority and rationale, planned window with offsets, duration, readiness information, optional exact observation/review references, optional workflow reference, revision and stable exchange identity.
- **Acknowledgement / update:** same correlation identity, external work-order ID, source revision (or source event ID), state and source timestamps. Authenticate the sender, deduplicate durably, reject revision conflicts, and reconcile out-of-order delivery. Never blindly retry order creation after an ambiguous response.
- **Verification:** work-order link, post-intervention campaign/observation/evidence, authenticated reviewer, review reason and decision. Record evidence acquisition time as well as review time. Preserve prior assessments when an order is reopened or a finding is reassessed.
- **Delivery acceptance:** expected coverage and quality criteria, delivered coverage, limitations, rework and an authorized acceptance decision. Keep processing, waiting and review timing separate. Workflow success does not set acceptance.

The example contract is illustrative and versioned under `cyberwave.example.*`; it is not a published Cyberwave endpoint or an integration standard. Its local revision checks teach reconciliation, not exactly-once delivery. The actual maintenance adapter must use the external system's contract and authenticated server-side persistence.

## Small backend increments, in order

1. Agree the external system and asset mapping; start with controlled export/import and a durable exchange receipt. Revalidate referenced review revisions and caller scope before actual submission. Reuse existing application integration patterns, with an outbox/inbox only when an automated connector needs reliable delivery. Do not build another work-order engine.
2. Extend existing append-only inspection reviews with an explicit verification relation and evidence-backed resolution. Today the API intentionally excludes `resolved`; do not send the demo's resolution value to `inspections.review`. Validate post-intervention evidence, permissions and revision conflicts server-side. Prefer evidence/relationship additions to a parallel Mission or MaintenancePlan model.
3. Add expected/delivered scope and reasoned acceptance/rework to the existing campaign boundary. Introduce assignment/deadline/phase timing only for a concrete delivery workflow; do not encode business acceptance in workflow execution status.
4. Harden one-off scheduled workflow runs, due-slot recovery and resource claims when operations require them. Keep recurring schedule semantics intact. Add scoped paginated governance queries before client-side fan-out becomes a bottleneck.

This increment adds no database model or scheduler. Local workflow persistence and real inspection reads remain available through the same SDK and backend patterns. Proposals, external updates and verification decisions above are deliberately local demonstration state until those contracts exist.
