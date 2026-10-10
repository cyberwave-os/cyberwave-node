"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { CyberwaveError } from "cyberwave";
import {
  connectVideo,
  type VideoState,
  type VideoTarget,
} from "cyberwave/video";
import { useCyberwave } from "./index.js";
import { useResourceKey } from "./resource.js";

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
  { target, className, ...options },
  ref,
) {
  const state = useVideoStream(target, options),
    video = useRef<HTMLVideoElement>(null);
  const [decoded, setDecoded] = useState(false);
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
