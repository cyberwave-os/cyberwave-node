import { useEffect, useState } from "react";
import type { CyberwaveClient, EvidenceReviewInput } from "cyberwave";
import { workflowError } from "./workflow-monitor.js";
type EvidenceRecord = Awaited<
  ReturnType<CyberwaveClient["evidence"]["history"]>
>[number];
/** Evidence selection and an authenticated append-only review. No external order is closed. */
export function EvidenceVerificationPanel({
  client,
  environmentId,
  subjectId,
  baselineReviewId,
  severity,
  priority,
  readOnly = true,
}: {
  client: CyberwaveClient;
  environmentId: string;
  subjectId: string;
  baselineReviewId: string;
  severity: EvidenceReviewInput["assessment"]["severity"];
  priority: EvidenceReviewInput["assessment"]["priority"];
  readOnly?: boolean;
}) {
  const [history, setHistory] = useState<EvidenceRecord[]>([]);
  const [page, setPage] = useState(0),
    [revision, refresh] = useState(0);
  const [selected, select] = useState("");
  const [reason, setReason] = useState(""),
    [order, setOrder] = useState("");
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    setPage(0);
    select("");
    setReason("");
    setOrder("");
    setKey(crypto.randomUUID());
  }, [client, environmentId, subjectId, baselineReviewId]);
  useEffect(() => {
    const abort = new AbortController();
    setHistory([]);
    select("");
    setStatus("Loading evidence…");
    client.evidence
      .history(
        environmentId,
        subjectId,
        { limit: 10, offset: page * 10 },
        { signal: abort.signal },
      )
      .then((items) => {
        if (!abort.signal.aborted) {
          setHistory(items);
          setStatus("");
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) setStatus(workflowError(error));
      });
    return () => abort.abort();
  }, [client, environmentId, subjectId, page, revision]);
  const record = history.find((item) => item.uuid === selected);
  const latest = record?.reviews.reduce<
    EvidenceRecord["reviews"][number] | undefined
  >((a, b) => (!a || b.revision > a.revision ? b : a), undefined);
  const covered =
    record?.source.target_covered === true &&
    Boolean(record.source.evidence);
  const canResolve = covered && record?.source.observed === false;
  async function save() {
    if (!record || !canResolve || busy) return;
    setBusy(true);
    setStatus("Saving authenticated verification…");
    try {
      const review = await client.evidence.review(
        environmentId,
        record.uuid,
        {
          expected_revision: latest?.revision ?? 0,
          idempotency_key: key,
          reason,
          assessment: {
            decision: "validated",
            severity: severity,
            priority: priority,
            technical_state: "resolved",
            verification_of_review_uuid: baselineReviewId,
            ...(order.trim() ? { work_order_reference: order.trim() } : {}),
          },
        },
      );
      setHistory((items) =>
        items.map((item) =>
          item.uuid === record.uuid
            ? {
                ...item,
                reviews: [
                  ...item.reviews.filter((r) => r.uuid !== review.uuid),
                  review,
                ],
              }
            : item,
        ),
      );
      setStatus(
        `Resolution saved · review ${review.revision} · ${review.uuid}. Reviewer ${review.created_by_uuid}.`,
      );
      setKey(crypto.randomUUID());
    } catch (error) {
      setStatus(
        workflowError(error) +
          " Reload evidence after a conflict. Retrying unchanged input reuses the request key.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="cw-workflows section-gap">
      <h3>Verify a stored finding</h3>
      <p>
        Choose a later record of the same target. The backend checks
        covered-target evidence, absence of the finding and the latest validated
        baseline. Collection acceptance remains a separate decision.
      </p>
      <p className="muted">Baseline review: {baselineReviewId}</p>
      <label className="field">
        Verification record
        <select
          disabled={busy}
          value={selected}
          onChange={(e) => {
            select(e.target.value);
            setKey(crypto.randomUUID());
          }}
        >
          <option value="">Choose stored evidence</option>
          {history
            .filter(
              (item) =>
                !item.reviews.some(
                  (review) => review.uuid === baselineReviewId,
                ),
            )
            .map((item) => (
              <option key={item.uuid} value={item.uuid}>
                {item.source.external_id} ·{" "}
                {item.source.target_covered === true
                  ? "covered"
                  : "coverage unconfirmed"}{" "}
                · {item.source.observed ? "finding present" : "finding absent"}
              </option>
            ))}
        </select>
      </label>
      <div className="toolbar">
        <button
          className="cw-button"
          disabled={busy || !page}
          onClick={() => setPage(page - 1)}
        >
          Previous evidence
        </button>
        <button
          className="cw-button"
          disabled={busy || history.length < 10}
          onClick={() => setPage(page + 1)}
        >
          Next evidence
        </button>
        <button
          className="cw-button"
          disabled={busy}
          onClick={() => refresh(revision + 1)}
        >
          Reload evidence
        </button>
      </div>
      {record && (
        <div className="note">
          <p>Evidence: {record.source.evidence?.reference ?? "None"}</p>
          <p>{record.source.limitation}</p>
          <p>
            Latest condition:{" "}
            {latest?.assessment.technical_state ?? "Not reviewed"} · revision{" "}
            {latest?.revision ?? 0}
          </p>
          {latest && (
            <details>
              <summary>Saved review</summary>
              <p>
                Review: {latest.uuid} · author{" "}
                {latest.created_by_uuid ?? "Deleted user"}
              </p>
              <p>{latest.reason}</p>
              <p>
                External work order:{" "}
                {latest.assessment.work_order_reference ?? "None"}
              </p>
              <p>
                Baseline review:{" "}
                {latest.assessment.verification_of_review_uuid ?? "None"}
              </p>
            </details>
          )}
        </div>
      )}
      <label className="field">
        External work-order reference (optional)
        <input
          disabled={busy}
          value={order}
          onChange={(e) => {
            setOrder(e.target.value);
            setKey(crypto.randomUUID());
          }}
        />
      </label>
      <label className="field">
        Verification reason
        <textarea
          disabled={busy}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setKey(crypto.randomUUID());
          }}
        />
      </label>
      <button
        className="cw-button cw-primary"
        disabled={
          readOnly ||
          busy ||
          !canResolve ||
          !reason.trim() ||
          latest?.assessment.technical_state === "resolved"
        }
        onClick={save}
      >
        Save verified resolution
      </button>
      {!canResolve && record && (
        <p className="note">
          This record cannot establish resolution. Missing coverage or a
          persistent finding must remain visible.
        </p>
      )}
      <p role="status">{status}</p>
    </section>
  );
}
