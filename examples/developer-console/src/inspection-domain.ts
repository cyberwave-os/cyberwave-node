/** Application-owned inspection domain, pending a dedicated backend contract. */
export type Observation = {
  campaign: string;
  observed: boolean;
  value?: number;
  unit: "mm" | "px";
  uncertainty?: number;
  comparable: boolean;
  limitation?: string;
  evidenceSeconds: number;
  modelVersion: string;
  confidence: number;
};
export type Finding = {
  id: string;
  name: string;
  chainageM: number;
  severity: "low" | "medium" | "high";
  priority: "routine" | "planned" | "urgent";
  technical: "new" | "stable" | "worsened" | "not-assessable" | "resolved";
  review: "proposed" | "validated" | "rejected";
  observations: Observation[];
  revisions: {
    at: string;
    decision: string;
    reason: string;
    author: string;
    assessment: { severity: string; priority: string; technical: string };
  }[];
};
export const demoFindings: Finding[] = [
  {
    id: "DF-101",
    name: "Surface crack",
    chainageM: 180,
    severity: "medium",
    priority: "planned",
    technical: "not-assessable",
    review: "proposed",
    revisions: [],
    observations: [
      {
        campaign: "Baseline",
        observed: true,
        value: 1.1,
        unit: "mm",
        uncertainty: 0.2,
        comparable: true,
        evidenceSeconds: 4,
        modelVersion: "concrete-demo-v1",
        confidence: 0.81,
      },
      {
        campaign: "Follow-up",
        observed: true,
        value: 1.2,
        unit: "mm",
        uncertainty: 0.2,
        comparable: true,
        evidenceSeconds: 8,
        modelVersion: "concrete-demo-v2",
        confidence: 0.93,
      },
    ],
  },
  {
    id: "DF-102",
    name: "Surface loss",
    chainageM: 310,
    severity: "high",
    priority: "urgent",
    technical: "worsened",
    review: "validated",
    revisions: [],
    observations: [
      {
        campaign: "Baseline",
        observed: true,
        value: 14,
        unit: "mm",
        uncertainty: 1,
        comparable: true,
        evidenceSeconds: 12,
        modelVersion: "concrete-demo-v1",
        confidence: 0.9,
      },
      {
        campaign: "Follow-up",
        observed: true,
        value: 22,
        unit: "mm",
        uncertainty: 1,
        comparable: true,
        evidenceSeconds: 16,
        modelVersion: "concrete-demo-v2",
        confidence: 0.85,
      },
    ],
  },
  {
    id: "DF-103",
    name: "Moisture trace",
    chainageM: 440,
    severity: "low",
    priority: "routine",
    technical: "not-assessable",
    review: "proposed",
    revisions: [],
    observations: [
      {
        campaign: "Baseline",
        observed: true,
        value: 45,
        unit: "px",
        comparable: false,
        limitation: "No physical scale calibration",
        evidenceSeconds: 19,
        modelVersion: "surface-demo-v1",
        confidence: 0.75,
      },
      {
        campaign: "Follow-up",
        observed: false,
        unit: "px",
        comparable: false,
        limitation: "This section was outside the delivered coverage",
        evidenceSeconds: 0,
        modelVersion: "surface-demo-v2",
        confidence: 0,
      },
    ],
  },
];
export function compareObservations(a: Observation, b: Observation) {
  if (!a.observed || !b.observed)
    return {
      status: "not-assessable",
      reason: "Missing observation or coverage is not evidence of resolution.",
    };
  if (
    !a.comparable ||
    !b.comparable ||
    a.unit !== b.unit ||
    a.unit === "px" ||
    a.value === undefined ||
    b.value === undefined ||
    a.uncertainty === undefined ||
    b.uncertainty === undefined ||
    ![a.value, b.value, a.uncertainty, b.uncertainty].every(Number.isFinite) ||
    a.uncertainty < 0 ||
    b.uncertainty < 0
  )
    return {
      status: "not-assessable",
      reason:
        "Comparable physical units, calibration and uncertainty are required.",
    };
  const delta = b.value - a.value,
    bound = a.uncertainty + b.uncertainty;
  return {
    status:
      Math.abs(delta) <= bound
        ? "within-uncertainty"
        : delta > 0
          ? "increase"
          : "decrease",
    reason: `Change ${delta.toFixed(2)} ${a.unit}; combined interval bound ±${bound.toFixed(2)} ${a.unit}. Technical interpretation belongs to the reviewer.`,
  };
}
export function reviewFinding(
  finding: Finding,
  decision: "validated" | "rejected",
  reason: string,
  at: string,
): Finding {
  if (!reason.trim()) throw new Error("Add a reason for the review decision.");
  return {
    ...finding,
    review: decision,
    revisions: [
      ...finding.revisions,
      {
        at,
        decision,
        reason: reason.trim(),
        author: "Local demonstration reviewer",
        assessment: {
          severity: finding.severity,
          priority: finding.priority,
          technical: finding.technical,
        },
      },
    ],
  };
}
