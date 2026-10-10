/** Application-owned maintenance proposals. These are examples, not platform models. */
import type { InspectionCampaign } from "cyberwave";

export type FindingReference = {
  environmentId: string;
  campaignId: string;
  defectId: string;
  observationId: string;
  reviewId: string;
  revision: number;
  assetReference: string;
  evidenceReference: string;
  name: string;
  severity: string;
  priority: string;
  technicalState: string;
};
export function validatedFindings(
  environmentId: string,
  campaign: InspectionCampaign,
): FindingReference[] {
  return campaign.observations.flatMap((observation) => {
    const review = observation.reviews.reduce<
      (typeof observation.reviews)[number] | undefined
    >(
      (latest, item) =>
        !latest || item.revision > latest.revision ? item : latest,
      undefined,
    );
    if (
      review?.assessment.decision !== "validated" ||
      !observation.source.observed ||
      !observation.source.evidence
    )
      return [];
    return [
      {
        environmentId,
        campaignId: campaign.uuid,
        defectId: observation.defect_uuid,
        observationId: observation.uuid,
        reviewId: review.uuid,
        revision: review.revision,
        assetReference: campaign.asset_reference,
        evidenceReference: observation.source.evidence.reference,
        name: observation.source.kind,
        severity: review.assessment.severity,
        priority: review.assessment.priority,
        technicalState: review.assessment.technical_state,
      },
    ];
  });
}
export type MaintenanceProposal = {
  requestId: string;
  revision: number;
  purpose: "preventive" | "corrective";
  assetReference: string;
  businessUnit: string;
  owner: string;
  summary: string;
  priority: "routine" | "planned" | "urgent";
  crew: string;
  windowStart: string;
  windowEnd: string;
  durationMinutes: number;
  partsReady: boolean;
  accessReady: boolean;
  finding?: FindingReference;
};
export type Reservation = {
  name: string;
  crew: string;
  start: string;
  end: string;
};
export const demoReservation: Reservation = {
  name: "Existing pump check",
  crew: "mechanical-team",
  start: "2026-11-03T09:00:00Z",
  end: "2026-11-03T10:00:00Z",
};
export function initialProposal(requestId: string): MaintenanceProposal {
  return {
    requestId,
    revision: 1,
    purpose: "preventive",
    assetReference: "PLANT/PUMP-07",
    businessUnit: "Utilities",
    owner: "Plant maintenance",
    summary: "Check pump condition and record evidence",
    priority: "planned",
    crew: "mechanical-team",
    windowStart: "2026-11-03T10:00:00Z",
    windowEnd: "2026-11-03T12:00:00Z",
    durationMinutes: 45,
    partsReady: false,
    accessReady: false,
  };
}
function instant(value: string) {
  return /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
}
export function planningIssues(
  proposal: MaintenanceProposal,
  reservations: Reservation[] = [],
): string[] {
  const issues: string[] = [];
  if (
    ![
      proposal.assetReference,
      proposal.businessUnit,
      proposal.owner,
      proposal.summary,
      proposal.crew,
    ].every((s) => s.trim())
  )
    issues.push(
      "Set the asset, business unit, owner, work description and crew.",
    );
  if (proposal.purpose === "corrective" && !proposal.finding)
    issues.push(
      "Link a validated finding with evidence before preparing corrective work.",
    );
  if (
    proposal.finding &&
    proposal.assetReference !== proposal.finding.assetReference
  )
    issues.push("The asset reference must match the selected finding.");
  const start = instant(proposal.windowStart),
    end = instant(proposal.windowEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    issues.push("Use an increasing work window with explicit UTC offsets.");
  if (
    !Number.isFinite(proposal.durationMinutes) ||
    proposal.durationMinutes <= 0 ||
    proposal.durationMinutes * 60000 > end - start
  )
    issues.push(
      "The work duration must be positive and fit inside the window.",
    );
  if (!proposal.partsReady) issues.push("Confirm parts and tools are ready.");
  if (!proposal.accessReady)
    issues.push(
      "Confirm access and isolation arrangements with the site owner.",
    );
  for (const row of reservations) {
    if (
      row.crew === proposal.crew &&
      start < instant(row.end) &&
      end > instant(row.start)
    )
      issues.push(`Crew window overlaps: ${row.name}.`);
  }
  return issues;
}
export function maintenanceHandoff(
  proposal: MaintenanceProposal,
  reservations: Reservation[] = [],
) {
  const issues = planningIssues(proposal, reservations);
  if (issues.length) throw new Error(issues.join(" "));
  return {
    schema: "cyberwave.example.maintenance.v1",
    delivery: "not-submitted",
    exchangeKey: `${proposal.requestId}:${proposal.revision}`,
    proposal: structuredClone(proposal),
  };
}
export type MaintenanceHandoff = ReturnType<typeof maintenanceHandoff>;

export type WorkOrderUpdate = {
  exchangeKey: string;
  externalId: string;
  revision: number;
  state: "accepted" | "in-progress" | "completed";
};
/** A transport replay is harmless; same-revision conflicts and out-of-order updates need reconciliation. */
export function reconcileWorkOrder(
  exchangeKey: string,
  current: WorkOrderUpdate | undefined,
  incoming: WorkOrderUpdate,
): WorkOrderUpdate {
  if (incoming.exchangeKey !== exchangeKey)
    throw new Error("Update belongs to another handoff.");
  if (
    !incoming.externalId.trim() ||
    !Number.isInteger(incoming.revision) ||
    incoming.revision < 1
  )
    throw new Error(
      "Provide an external work-order ID and a positive integer revision.",
    );
  if (current) {
    if (incoming.externalId !== current.externalId)
      throw new Error(
        "External work-order ID changed; reconcile with the source system.",
      );
    if (incoming.revision < current.revision)
      throw new Error(
        "Older update ignored; reconcile with the source system.",
      );
    if (
      incoming.revision === current.revision &&
      incoming.state !== current.state
    )
      throw new Error("Conflicting update at the same revision.");
    if (incoming.revision === current.revision) return current;
  }
  return { ...incoming };
}
export type Verification = {
  targetObserved: boolean;
  evidenceReference: string;
  campaignReference: string;
  reviewer: string;
  reason: string;
  outcome: "resolved" | "still-present" | "not-assessable";
  coveragePercent: number;
  requiredCoveragePercent: number;
  reviewed: boolean;
};
export function verificationDecision(
  order: WorkOrderUpdate | undefined,
  verification: Verification,
) {
  const issues: string[] = [];
  if (order?.state !== "completed")
    issues.push("Wait for completion from the maintenance system.");
  if (!verification.targetObserved)
    issues.push(
      "The target must be inspected again; missing detection is not proof of resolution.",
    );
  if (
    ![
      verification.evidenceReference,
      verification.campaignReference,
      verification.reviewer,
      verification.reason,
    ].every((s) => s.trim())
  )
    issues.push(
      "Record the verification campaign, evidence, reviewer and reason.",
    );
  if (!verification.reviewed)
    issues.push("An explicit expert review is required.");
  const coverageValid =
    [verification.coveragePercent, verification.requiredCoveragePercent].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= 100,
    ) && verification.requiredCoveragePercent > 0;
  const coverageMet =
    coverageValid &&
    verification.coveragePercent >= verification.requiredCoveragePercent;
  const canResolve = issues.length === 0 && verification.outcome === "resolved";
  return {
    issues,
    canResolve,
    technicalState: issues.length ? "unverified" : verification.outcome,
    delivery:
      issues.length || !coverageMet || verification.outcome === "not-assessable"
        ? "rework-required"
        : "ready-for-acceptance",
    coverageMet,
  };
}
