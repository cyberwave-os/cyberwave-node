import test from "node:test";
import assert from "node:assert/strict";
import {
  initialProposal,
  demoReservation,
  planningIssues,
  maintenanceHandoff,
  validatedFindings,
  reconcileWorkOrder,
  verificationDecision,
  type Verification,
} from "../src/maintenance-domain.ts";
import type { EvidenceCollection } from "cyberwave";
const proposal = {
  ...initialProposal("request-1"),
  partsReady: true,
  accessReady: true,
};
const order = {
  exchangeKey: "request-1:1",
  externalId: "work-1",
  revision: 2,
  state: "completed" as const,
};
const verification: Verification = {
  targetObserved: true,
  evidenceReference: "recording@42",
  campaignReference: "after-repair",
  reviewer: "Expert",
  reason: "Repaired target inspected",
  outcome: "resolved",
  coveragePercent: 100,
  requiredCoveragePercent: 100,
  reviewed: true,
};
test("preventive work needs no defect; corrective work requires a validated source", () => {
  assert.deepEqual(planningIssues(proposal), []);
  assert.match(
    planningIssues({ ...proposal, purpose: "corrective" }).join(" "),
    /validated finding/,
  );
  assert.throws(
    () => maintenanceHandoff({ ...proposal, accessReady: false }),
    /access/,
  );
});
test("work windows require offsets, positive duration and conservative crew conflict checks", () => {
  assert.deepEqual(planningIssues(proposal, [demoReservation]), []);
  assert.match(
    planningIssues({ ...proposal, windowStart: "2026-11-03T09:30:00Z" }, [
      demoReservation,
    ]).join(" "),
    /overlaps/,
  );
  assert.deepEqual(
    planningIssues(
      { ...proposal, windowStart: "2026-11-03T09:30:00Z", crew: "other" },
      [demoReservation],
    ),
    [],
  );
  for (const patch of [
    { windowStart: "2026-11-03T10:00:00" },
    { durationMinutes: Infinity },
    { durationMinutes: 121 },
    { windowEnd: proposal.windowStart },
  ])
    assert.ok(planningIssues({ ...proposal, ...patch }).length);
});
test("unchanged handoffs retain key and data; edits advance the exchange identity", () => {
  const first = maintenanceHandoff(proposal);
  assert.deepEqual(maintenanceHandoff(proposal), first);
  assert.equal(first.exchangeKey, "request-1:1");
  assert.equal(
    maintenanceHandoff({ ...proposal, revision: 2 }).exchangeKey,
    "request-1:2",
  );
  first.proposal.owner = "changed";
  assert.notEqual(proposal.owner, "changed");
});
test("campaign projection uses the latest review, never superseded validation or missing evidence", () => {
  const validated = {
    uuid: "review1",
    revision: 1,
    assessment: {
      decision: "validated",
      severity: "high",
      priority: "urgent",
      technical_state: "worsened",
    },
  };
  const rejected = {
    ...validated,
    uuid: "review2",
    revision: 2,
    assessment: { ...validated.assessment, decision: "rejected" },
  };
  const campaign = {
    uuid: "campaign",
    asset_reference: "asset",
    records: [
      {
        uuid: "observation",
        subject_uuid: "defect",
        source: {
          observed: true,
          evidence: { reference: "video" },
          kind: "Surface loss",
        },
        reviews: [rejected, validated],
      },
    ],
  } as unknown as EvidenceCollection;
  assert.deepEqual(validatedFindings("env", campaign), []);
  campaign.records[0].reviews = [validated as any];
  const [finding] = validatedFindings("env", campaign);
  assert.equal(finding.reviewId, "review1");
  assert.equal(finding.evidenceReference, "video");
  assert.match(
    planningIssues({ ...proposal, finding }).join(" "),
    /asset reference/,
  );
  campaign.records[0].source.observed = false;
  assert.deepEqual(validatedFindings("env", campaign), []);
  campaign.records[0].source.observed = true;
  campaign.records[0].source.evidence = null;
  assert.deepEqual(validatedFindings("env", campaign), []);
});
test("work-order replays are idempotent; conflicting, stale and unrelated updates cannot overwrite state", () => {
  assert.equal(
    reconcileWorkOrder(order.exchangeKey, order, { ...order }),
    order,
  );
  for (const patch of [
    { revision: 1 },
    { revision: 2, state: "accepted" as const },
    { exchangeKey: "wrong" },
    { externalId: "other" },
    { revision: 2.5 },
  ])
    assert.throws(() =>
      reconcileWorkOrder(order.exchangeKey, order, { ...order, ...patch }),
    );
  assert.equal(
    reconcileWorkOrder(order.exchangeKey, order, {
      ...order,
      revision: 3,
      state: "in-progress",
    }).state,
    "in-progress",
  );
});
test("work completion never proves resolution without a newly covered, reviewed observation", () => {
  for (const patch of [
    { targetObserved: false },
    { evidenceReference: "" },
    { reviewed: false },
    { reason: "  " },
  ]) {
    const decision = verificationDecision(order, { ...verification, ...patch });
    assert.equal(decision.canResolve, false);
    assert.equal(decision.technicalState, "unverified");
  }
  assert.equal(verificationDecision(undefined, verification).canResolve, false);
  assert.equal(
    verificationDecision({ ...order, state: "in-progress" }, verification)
      .canResolve,
    false,
  );
});
test("a covered defect can resolve while incomplete delivery still requires rework", () => {
  const partial = verificationDecision(order, {
    ...verification,
    coveragePercent: 68,
  });
  assert.equal(partial.canResolve, true);
  assert.equal(partial.delivery, "rework-required");
  assert.equal(
    verificationDecision(order, verification).delivery,
    "ready-for-acceptance",
  );
  const persistent = verificationDecision(order, {
    ...verification,
    outcome: "still-present",
  });
  assert.equal(persistent.canResolve, false);
  assert.equal(persistent.delivery, "ready-for-acceptance");
  for (const coveragePercent of [NaN, -1, 101])
    assert.equal(
      verificationDecision(order, { ...verification, coveragePercent })
        .delivery,
      "rework-required",
    );
});
