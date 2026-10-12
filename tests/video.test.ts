import test from "node:test";
import assert from "node:assert/strict";
import { createCyberwave } from "../dist/index.js";
import { connectVideo, normalizeVideoOfferSdp } from "../dist/video.js";

const offer =
  "v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 120\r\na=rtpmap:120 VP8/90000\r\na=recvonly\r\n";
class Track extends EventTarget {
  kind = "video";
  stops = 0;
  stop() {
    this.stops++;
  }
}
class Stream {
  tracks: Track[] = [];
  addTrack(track: Track) {
    this.tracks.push(track);
  }
  getTracks() {
    return this.tracks;
  }
  getVideoTracks() {
    return this.tracks;
  }
}
Object.assign(globalThis, { MediaStream: Stream });
class Peer extends EventTarget {
  connectionState = "new";
  iceGatheringState = "complete";
  localDescription?: RTCSessionDescriptionInit;
  remoteDescription?: RTCSessionDescriptionInit;
  transceivers: unknown[] = [];
  track = new Track();
  closes = 0;
  addTransceiver(...args: unknown[]) {
    this.transceivers.push(args);
  }
  async createOffer() {
    return { type: "offer", sdp: offer };
  }
  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description;
  }
  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
    this.connectionState = "connected";
    const event = new Event("track");
    Object.assign(event, { track: this.track });
    this.dispatchEvent(event);
    this.dispatchEvent(new Event("connectionstatechange"));
  }
  close() {
    this.closes++;
    this.connectionState = "closed";
    this.dispatchEvent(new Event("connectionstatechange"));
  }
}
const target = {
  twinUuid: "robot",
  sensorId: "front",
  streamSource: "simulation" as const,
  streamInstanceId: "run-1",
  kind: "depth" as const,
};
function options(peer: Peer) {
  return { createPeerConnection: () => peer as unknown as RTCPeerConnection };
}
const handle = {
  session_id: "viewer-1",
  sdp_answer: offer,
  close_token: "owned-close-handle",
};

test("video is receive-only, routes the full source identity and releases only its owned session", async (t) => {
  const calls: { path: string; body: any }[] = [];
  const client = createCyberwave({
    fetch: async (req) => {
      const request = req as Request;
      calls.push({
        path: new URL(request.url).pathname,
        body: await request.json(),
      });
      return Response.json(
        request.url.endsWith("/close") ? { closed: true } : handle,
      );
    },
  });
  const peer = new Peer(),
    states: string[] = [];
  const connection = await connectVideo(client, target, {
    ...options(peer),
    onState: (state) => states.push(state),
  });
  assert.deepEqual(peer.transceivers, [["video", { direction: "recvonly" }]]);
  assert.deepEqual(calls[0].body, {
    sensor_id: "front",
    sdp_offer: normalizeVideoOfferSdp(offer),
    stream_source: "simulation",
    stream_instance_id: "run-1",
    frontend_type: "depth",
  });
  assert.match(calls[0].body.sdp_offer, /rtpmap:96 VP8/);
  assert.equal(connection.stream.getVideoTracks().length, 1);
  peer.connectionState = "disconnected";
  peer.dispatchEvent(new Event("connectionstatechange"));
  peer.connectionState = "connected";
  peer.dispatchEvent(new Event("connectionstatechange"));
  assert.deepEqual(states, [
    "connecting",
    "connected",
    "interrupted",
    "connected",
  ]);
  await Promise.all([connection.close(), connection.close()]);
  assert.deepEqual(calls[1], {
    path: "/api/v1/twins/robot/video-sessions/viewer-1/close",
    body: { close_token: "owned-close-handle" },
  });
  assert.equal(calls.length, 2);
  assert.equal(peer.closes, 1);
  assert.equal(peer.track.stops, 1);
});
test("abort closes the local peer immediately and releases a late server allocation", async (t) => {
  let submitted!: () => void,
    reply!: (response: Response) => void,
    closes = 0;
  const sent = new Promise<void>((resolve) => {
    submitted = resolve;
  });
  const client = createCyberwave({
    fetch: async (req) => {
      if ((req as Request).url.endsWith("/close")) {
        closes++;
        return Response.json({ closed: true });
      }
      submitted();
      return new Promise((resolve) => {
        reply = resolve;
      });
    },
  });
  const peer = new Peer(),
    abort = new AbortController();
  const pending = connectVideo(client, target, {
    ...options(peer),
    signal: abort.signal,
  });
  await sent;
  abort.abort();
  assert.equal(peer.closes, 1);
  reply(Response.json(handle));
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(closes, 1);
  assert.equal(peer.remoteDescription, undefined);
});
test("ICE timeout happens before submission and a missing producer is never retried", async (t) => {
  let calls = 0;
  const client = createCyberwave({
    fetch: async () => {
      calls++;
      return Response.json({ detail: "No producer" }, { status: 409 });
    },
  });
  const waiting = new Peer();
  waiting.iceGatheringState = "gathering";
  await assert.rejects(
    connectVideo(client, target, { ...options(waiting), timeoutMs: 10 }),
    { name: "TimeoutError" },
  );
  assert.equal(calls, 0);
  assert.equal(waiting.closes, 1);
  const unavailable = new Peer();
  await assert.rejects(connectVideo(client, target, options(unavailable)), {
    status: 409,
  });
  assert.equal(calls, 1);
  assert.equal(unavailable.closes, 1);
});
test("a rejected SDP answer releases the allocated viewer", async (t) => {
  let closes = 0;
  const client = createCyberwave({
    fetch: async (req) => {
      if ((req as Request).url.endsWith("/close")) {
        closes++;
        return Response.json({ closed: true });
      }
      return Response.json(handle);
    },
  });
  const peer = new Peer();
  peer.setRemoteDescription = async () => {
    throw new Error("Unsupported codec");
  };
  await assert.rejects(
    connectVideo(client, target, options(peer)),
    /Unsupported codec/,
  );
  assert.equal(closes, 1);
  assert.equal(peer.closes, 1);
});

test("failed teardown can be retried without allocating another viewer", async () => {
  let opens = 0,
    closes = 0;
  const client = createCyberwave({
    fetch: async (request) => {
      if ((request as Request).url.endsWith("/close")) {
        closes++;
        return closes === 1
          ? Response.json({ detail: "Unavailable" }, { status: 503 })
          : Response.json({ closed: true });
      }
      opens++;
      return Response.json(handle);
    },
  });
  const peer = new Peer(),
    viewer = await connectVideo(client, target, options(peer));
  await assert.rejects(viewer.close(), { status: 503 });
  await viewer.close();
  assert.equal(opens, 1);
  assert.equal(closes, 2);
  assert.equal(peer.closes, 1);
});
