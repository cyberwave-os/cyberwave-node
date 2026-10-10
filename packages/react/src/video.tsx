"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { CyberwaveError, twinSensors, type Twin } from "cyberwave";
import {
  connectVideo,
  type VideoState,
  type VideoTarget,
} from "cyberwave/video";
import { useCyberwave } from "./index.js";
import { useResourceKey } from "./resource.js";
import { captureVideoFrame, type CapturedFrame } from "./annotation/capture.js";
import { SensorSelector } from "./sensor-controls.js";

type ViewerState = {
  status: VideoState | "idle" | "error";
  stream?: MediaStream;
  error?: Error;
};
export type VideoStreamOptions = {
  enabled?: boolean;
  /** Memoize the configuration so an unrelated render does not renegotiate. */
  rtcConfiguration?: RTCConfiguration;
};
/** Receive-only. Changing the client or any source identity disposes the old viewer. */
export function useVideoStream(
  target: VideoTarget,
  options: VideoStreamOptions = {},
) {
  const client = useCyberwave();
  const { twinUuid, sensorId, streamSource, streamInstanceId, kind } = target;
  const { enabled = true, rtcConfiguration } = options;
  const scope = useMemo(
    () => ({
      client,
      target: { twinUuid, sensorId, streamSource, streamInstanceId, kind },
      enabled,
      rtcConfiguration,
    }),
    [
      client,
      twinUuid,
      sensorId,
      streamSource,
      streamInstanceId,
      kind,
      enabled,
      rtcConfiguration,
    ],
  );
  const [state, setState] = useState<ViewerState & { scope?: typeof scope }>({
    status: "idle",
  });
  useEffect(() => {
    if (!scope.enabled) return;
    const abort = new AbortController();
    setState({ scope, status: "connecting" });
    connectVideo(scope.client, scope.target, {
      signal: abort.signal,
      rtcConfiguration: scope.rtcConfiguration,
      onState: (status) => {
        if (!abort.signal.aborted)
          setState((previous) => ({ ...previous, scope, status }));
      },
    }).then(
      (connection) => {
        if (!abort.signal.aborted)
          setState({ scope, stream: connection.stream, status: "connected" });
      },
      (error) => {
        if (!abort.signal.aborted)
          setState({
            scope,
            status: "error",
            error: error instanceof Error ? error : new Error(String(error)),
          });
      },
    );
    return () => abort.abort();
  }, [scope]);
  return state.scope === scope
    ? state
    : { status: enabled ? ("connecting" as const) : ("idle" as const) };
}

export type VideoStreamProps = VideoStreamOptions & {
  target: VideoTarget;
  className?: string;
  onReadyChange?: (ready: boolean) => void;
};
/** A forwarded video ref can be passed to captureVideoFrame from the annotation entry point. */
export const VideoStream = forwardRef<HTMLVideoElement, VideoStreamProps>(
  function VideoStream(props, ref) {
    const t = props.target;
    const key = useResourceKey(
      useCyberwave(),
      t.twinUuid,
      t.sensorId,
      t.streamSource,
      t.streamInstanceId,
      t.kind,
      props.enabled,
      props.rtcConfiguration,
    );
    return <Viewer key={key} {...props} ref={ref} />;
  },
);
const Viewer = forwardRef<HTMLVideoElement, VideoStreamProps>(function Viewer(
  { target, className, onReadyChange, ...options },
  ref,
) {
  const state = useVideoStream(target, options),
    video = useRef<HTMLVideoElement>(null);
  const [decoded, setDecoded] = useState(false);
  useEffect(() => {
    onReadyChange?.(decoded && state.status === "connected");
  }, [decoded, state.status, onReadyChange]);
  useImperativeHandle(ref, () => video.current!, []);
  useEffect(() => {
    const element = video.current!;
    element.srcObject = state.stream ?? null;
    return () => {
      element.srcObject = null;
    };
  }, [state.stream]);
  return (
    <section className={className} aria-label="Sensor video">
      <video
        ref={video}
        className="cw-recording-video"
        autoPlay
        muted
        playsInline
        controls
        onLoadedData={() => setDecoded(true)}
      />
      <p role="status">
        {state.status === "connected"
          ? decoded
            ? "Receiving video"
            : "Connected · waiting for a decoded frame"
          : state.status}
      </p>
      {state.error && (
        <p role="alert" className="cw-error">
          {viewerError(state.error)}
        </p>
      )}
    </section>
  );
});

export type SensorVideoPanelProps = VideoStreamOptions & {
  twin: Twin;
  initialSensorId?: string;
  /** Replace the built-in preview with an application review journey. */
  showCapturePreview?: boolean;
  streamSource?: "live" | "simulation";
  streamInstanceId?: string;
  /** Frame stays local unless the host explicitly uploads it. */
  onCapture?: (frame: CapturedFrame, target: VideoTarget) => void;
};
/** Opinionated receive-only camera picker, connection controls and frame capture. */
export function SensorVideoPanel(props: SensorVideoPanelProps) {
  const key = useResourceKey(
    useCyberwave(),
    props.twin.uuid,
    JSON.stringify(twinSensors(props.twin)),
    props.initialSensorId,
    props.streamSource,
    props.streamInstanceId,
    props.rtcConfiguration,
    props.enabled,
  );
  return <SensorVideoControls key={key} {...props} />;
}
function SensorVideoControls({
  twin,
  initialSensorId = "",
  showCapturePreview = true,
  streamSource = "live",
  streamInstanceId = "default",
  rtcConfiguration,
  enabled = true,
  onCapture,
}: SensorVideoPanelProps) {
  const [sensorId, setSensorId] = useState(initialSensorId),
    [watching, setWatching] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [frame, setFrame] = useState<CapturedFrame>(),
    [url, setUrl] = useState("");
  const video = useRef<HTMLVideoElement>(null),
    generation = useRef(0);
  const sensor = twinSensors(twin).find(
    (s) => s.id === sensorId && ["rgb", "depth"].includes(s.type),
  );
  const target: VideoTarget = {
    twinUuid: twin.uuid,
    sensorId,
    streamSource,
    streamInstanceId,
    kind: sensor?.type === "depth" ? "depth" : "rgb",
  };
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (!frame) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(frame.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [frame]);
  function reset() {
    generation.current++;
    setWatching(false);
    setReady(false);
    setFrame(undefined);
    setError("");
    setBusy(false);
  }
  async function capture() {
    const current = generation.current;
    setBusy(true);
    setError("");
    try {
      const result = await captureVideoFrame(video.current!);
      if (current !== generation.current) return;
      setFrame(result);
      onCapture?.(result, target);
    } catch (error) {
      if (current === generation.current) setError((error as Error).message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <section className="cw-video-console" aria-label="Camera controls">
      <div className="cw-sensor-heading">
        <h3>{twin.name || "Twin camera"}</h3>
        <span>
          {streamSource} · {streamInstanceId}
        </span>
      </div>
      <SensorSelector
        twin={twin}
        value={sensorId}
        videoOnly
        onChange={(id) => {
          reset();
          setSensorId(id);
        }}
      />
      <div className="cw-pagination">
        <button
          type="button"
          className="cw-button"
          disabled={!enabled || !sensor || watching || !streamInstanceId.trim()}
          onClick={() => {
            setWatching(true);
            setAttempt((n) => n + 1);
          }}
        >
          Watch stream
        </button>
        <button
          type="button"
          className="cw-button"
          disabled={!watching}
          onClick={reset}
        >
          Stop viewing
        </button>
        <button
          type="button"
          className="cw-button"
          disabled={!watching}
          onClick={() => {
            generation.current++;
            setReady(false);
            setFrame(undefined);
            setError("");
            setBusy(false);
            setAttempt((n) => n + 1);
          }}
        >
          Reconnect
        </button>
        <button
          type="button"
          className="cw-button"
          disabled={!ready || busy || !watching}
          onClick={capture}
        >
          Capture frame
        </button>
      </div>
      {watching && sensor ? (
        <VideoStream
          key={`${sensorId}:${attempt}`}
          ref={video}
          target={target}
          rtcConfiguration={rtcConfiguration}
          onReadyChange={setReady}
        />
      ) : (
        <p>Select an active sensor and watch its stream.</p>
      )}
      {error && (
        <p role="alert" className="cw-error">
          {error}
        </p>
      )}
      {showCapturePreview && frame && url && (
        <figure>
          <img
            className="cw-recording-video"
            src={url}
            alt={`Captured ${sensorId} frame`}
          />
          <figcaption>
            {frame.width} × {frame.height} · {frame.capturedAt} · browser
            capture time
          </figcaption>
          <a
            className="cw-button"
            href={url}
            download={`${sensorId}-frame.png`}
          >
            Download PNG
          </a>
        </figure>
      )}
    </section>
  );
}

function viewerError(error: Error): string {
  if (!(error instanceof CyberwaveError)) return error.message;
  const messages: Record<number, string> = {
    404: "Video unavailable. Check the twin UUID and backend version (404).",
    405: "Video signaling is not permitted on this API connection (405).",
    409: "No matching camera producer is streaming. Check sensor, source and instance (409).",
    502: "The streaming service could not negotiate this video (502).",
    504: "The streaming service did not answer. Check SFU and broker connectivity (504).",
  };
  return messages[error.status] ?? error.message;
}
