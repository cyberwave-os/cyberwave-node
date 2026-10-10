"use client";
import { useEffect, useRef, useState } from "react";
import type { SampleAnnotation } from "cyberwave";
import type { CapturedFrame } from "./capture.js";
import { ImageAnnotationEditor } from "./editor.js";
import { useResourceKey } from "../resource.js";

export type ReviewedFrame = {
  frame: CapturedFrame;
  annotations: SampleAnnotation[];
};
/** Capture -> annotate -> explicit handoff. The host owns upload, dataset and review policy. */
export function CapturedFrameReview(props: {
  frame: CapturedFrame;
  onConfirm: (
    value: ReviewedFrame,
    signal: AbortSignal,
  ) => Promise<void> | void;
  confirmLabel?: string;
}) {
  const key = useResourceKey(props.frame);
  return <FrameReview key={key} {...props} />;
}
function FrameReview({
  frame,
  onConfirm,
  confirmLabel = "Use reviewed frame",
}: Parameters<typeof CapturedFrameReview>[0]) {
  const [url, setUrl] = useState(""),
    [annotations, setAnnotations] = useState<SampleAnnotation[]>([]);
  const [valid, setValid] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(frame.blob);
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
      operation.current?.abort();
    };
  }, [frame]);
  async function confirm() {
    if (operation.current) return;
    const abort = new AbortController();
    operation.current = abort;
    setBusy(true);
    setError("");
    setDone(false);
    try {
      await onConfirm({ frame, annotations }, abort.signal);
      if (!abort.signal.aborted) setDone(true);
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message);
    } finally {
      if (!abort.signal.aborted) {
        operation.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <section
      className="cw-browser cw-frame-review"
      aria-label="Review captured frame"
    >
      <h3>Review captured frame</h3>
      <p>
        {frame.width} × {frame.height} · {frame.capturedAt} · browser capture
        time
      </p>
      {url && (
        <ImageAnnotationEditor
          src={url}
          value={annotations}
          onChange={(value) => {
            setAnnotations(value);
            setDone(false);
          }}
          onValidityChange={setValid}
          readOnly={busy}
        />
      )}
      <div className="cw-pagination">
        <button
          type="button"
          className="cw-button"
          disabled={!valid || busy}
          onClick={confirm}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
        {url && (
          <a className="cw-button" href={url} download="captured-frame.png">
            Download PNG
          </a>
        )}
      </div>
      {error && (
        <p role="alert" className="cw-error">
          {error}
        </p>
      )}
      {done && <p role="status">Frame handed to your application.</p>}
    </section>
  );
}
