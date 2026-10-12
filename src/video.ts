import type { CyberwaveClient, VideoSession } from "./index.js";
import { normalizeVideoOfferSdp } from "./video-sdp.js";

export type VideoTarget = {
  twinUuid: string;
  sensorId: string;
  streamSource?: "live" | "simulation";
  streamInstanceId?: string;
  kind?: "rgb" | "depth";
};
export type VideoState = "connecting" | "connected" | "interrupted" | "closed";
export type VideoConnection = {
  stream: MediaStream;
  sessionId: string;
  close: () => Promise<void>;
};
export type VideoOptions = {
  signal?: AbortSignal;
  /** ICE and media connection deadline; defaults to 30 seconds. */
  timeoutMs?: number;
  /** Supply your deployment's STUN/TURN servers. No relay credentials are bundled. */
  rtcConfiguration?: RTCConfiguration;
  onState?: (state: VideoState) => void;
  createPeerConnection?: (configuration: RTCConfiguration) => RTCPeerConnection;
};

/** Receive-only WebRTC using Cyberwave's authenticated HTTP signaling bridge.
 * This consumes an existing camera producer. It never starts cameras or recording. */
export async function connectVideo(
  client: CyberwaveClient,
  target: VideoTarget,
  options: VideoOptions = {},
): Promise<VideoConnection> {
  options.signal?.throwIfAborted();
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 2_147_483_647
  )
    throw new Error("Use a positive finite video timeout.");
  const pc = (
    options.createPeerConnection ?? ((config) => new RTCPeerConnection(config))
  )(options.rtcConfiguration ?? {});
  const stream = new MediaStream();
  const deadline = new AbortController();
  const timer = setTimeout(
    () =>
      deadline.abort(
        new DOMException("Video connection timed out.", "TimeoutError"),
      ),
    timeoutMs,
  );
  const signal = options.signal
    ? AbortSignal.any([options.signal, deadline.signal])
    : deadline.signal;
  const pageExit = () =>
    deadline.abort(new DOMException("Video page closed.", "AbortError"));
  let session: VideoSession | undefined,
    releasePromise: Promise<void> | undefined;
  let stopped = false,
    connected = false;
  const endedHandlers = new Map<MediaStreamTrack, () => void>();
  const release = () => {
    if (session && !releasePromise)
      releasePromise = client.twins
        .closeVideo(target.twinUuid, session)
        .then(() => {})
        .catch((error) => {
          // Teardown is idempotent: allow an explicit retry after network failure.
          releasePromise = undefined;
          throw error;
        });
    return releasePromise ?? Promise.resolve();
  };
  const stopLocal = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    if (typeof window !== "undefined")
      window.removeEventListener("pagehide", pageExit);
    pc.removeEventListener("track", track);
    pc.removeEventListener("connectionstatechange", connectionChanged);
    for (const [item, handler] of endedHandlers)
      item.removeEventListener("ended", handler);
    endedHandlers.clear();
    for (const item of stream.getTracks()) item.stop();
    pc.close();
    options.onState?.("closed");
  };
  const abort = () => {
    stopLocal();
    void release().catch(() => {});
  };
  const track = (event: RTCTrackEvent) => {
    if (stopped) {
      event.track.stop();
      return;
    }
    if (!stream.getTracks().includes(event.track)) {
      stream.addTrack(event.track);
      const ended = () => {
        if (!stopped) options.onState?.("interrupted");
      };
      endedHandlers.set(event.track, ended);
      event.track.addEventListener("ended", ended, { once: true });
    }
  };
  const connectionChanged = () => {
    if (
      !stopped &&
      connected &&
      ["failed", "disconnected", "closed"].includes(pc.connectionState)
    )
      options.onState?.("interrupted");
    else if (!stopped && connected && pc.connectionState === "connected")
      options.onState?.("connected");
  };
  signal.addEventListener("abort", abort, { once: true });
  if (typeof window !== "undefined")
    window.addEventListener("pagehide", pageExit, { once: true });
  pc.addEventListener("track", track);
  pc.addEventListener("connectionstatechange", connectionChanged);

  // Event waits install handlers before checking state, so already-complete ICE
  // and track delivery during setRemoteDescription cannot be missed.
  const wait = (events: string[], ready: () => boolean) =>
    new Promise<void>((resolve, reject) => {
      const finish = (error?: unknown) => {
        for (const event of events) pc.removeEventListener(event, check);
        signal.removeEventListener("abort", check);
        if (error) reject(error);
        else resolve();
      };
      const check = () => {
        if (signal.aborted) finish(signal.reason);
        else if (["failed", "closed"].includes(pc.connectionState))
          finish(new Error("The video peer connection failed."));
        else if (ready()) finish();
      };
      for (const event of events) pc.addEventListener(event, check);
      signal.addEventListener("abort", check, { once: true });
      check();
    });
  try {
    options.onState?.("connecting");
    pc.addTransceiver("video", { direction: "recvonly" });
    const offer = await pc.createOffer();
    signal.throwIfAborted();
    await pc.setLocalDescription({
      type: "offer",
      sdp: normalizeVideoOfferSdp(offer.sdp ?? ""),
    });
    await wait(
      ["icegatheringstatechange", "connectionstatechange"],
      () => pc.iceGatheringState === "complete",
    );
    signal.throwIfAborted();
    // Once submitted, retain the response to release a late allocation after an
    // abort. The client's HTTP timeout still bounds this request. Never retry POST.
    session = await client.twins.openVideo(target.twinUuid, {
      sensor_id: target.sensorId,
      sdp_offer: pc.localDescription!.sdp,
      stream_source: target.streamSource ?? "live",
      stream_instance_id: target.streamInstanceId ?? "default",
      frontend_type: target.kind ?? "rgb",
    });
    signal.throwIfAborted();
    await pc.setRemoteDescription({ type: "answer", sdp: session.sdp_answer });
    await wait(
      ["connectionstatechange", "track"],
      () =>
        pc.connectionState === "connected" &&
        stream.getVideoTracks().length > 0,
    );
    connected = true;
    clearTimeout(timer);
    options.onState?.("connected");
    return {
      stream,
      sessionId: session.session_id,
      close: async () => {
        stopLocal();
        await release();
      },
    };
  } catch (error) {
    stopLocal();
    await release().catch(() => {});
    throw error;
  }
}

export { normalizeVideoOfferSdp } from "./video-sdp.js";
