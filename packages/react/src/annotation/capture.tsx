"use client";
import { useEffect, useRef, useState } from "react";
export type CapturedFrame = {
  blob: Blob;
  width: number;
  height: number;
  mediaTime: number;
  capturedAt: string;
};
/** Works with a video element already attached to a camera, recording or WebRTC stream. */
export async function captureVideoFrame(
  video: HTMLVideoElement,
): Promise<CapturedFrame> {
  const width = video.videoWidth,
    height = video.videoHeight;
  if (video.readyState < 2 || !width || !height)
    throw new Error("Wait for a decoded video frame.");
  if (width * height > 40_000_000)
    throw new Error("Frame exceeds 40 megapixels.");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas capture is unavailable.");
  const mediaTime = video.currentTime,
    capturedAt = new Date().toISOString();
  try {
    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("Could not encode the frame.")),
        "image/png",
      ),
    );
    return { blob, width, height, mediaTime, capturedAt };
  } catch {
    throw new Error(
      "Frame capture requires same-origin media or a CORS-enabled source.",
    );
  }
}

/** Explicit camera permission and track cleanup; uploading remains the host application's choice. */
export function ImageCapture({
  onCapture,
  disabled = false,
}: {
  onCapture: (frame: CapturedFrame) => void;
  disabled?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    generation = useRef(0);
  const [active, setActive] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const stop = () => {
    generation.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setActive(false);
  };
  useEffect(
    () => () => {
      generation.current++;
      stream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  async function start() {
    setBusy(true);
    setError("");
    const request = ++generation.current;
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      if (request !== generation.current) {
        next.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = next;
      video.current!.srcObject = next;
      await video.current!.play();
      if (request === generation.current) setActive(true);
    } catch (e) {
      if (request === generation.current) {
        stop();
        setError((e as Error).message);
      }
    } finally {
      if (request <= generation.current) setBusy(false);
    }
  }
  return (
    <section className="cw-image-capture">
      <video
        ref={video}
        muted
        playsInline
        aria-label="Camera preview"
        hidden={!active}
      />
      <div className="cw-annotation-toolbar">
        <button
          type="button"
          className="cw-button"
          disabled={disabled || busy || active}
          onClick={start}
        >
          Start camera
        </button>
        <button
          type="button"
          className="cw-button"
          disabled={disabled || !active || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              onCapture(await captureVideoFrame(video.current!));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Capture frame
        </button>
        <button
          type="button"
          className="cw-button"
          disabled={!active}
          onClick={stop}
        >
          Stop camera
        </button>
      </div>
      {error && (
        <p role="alert" className="cw-error">
          {error}
        </p>
      )}
    </section>
  );
}
