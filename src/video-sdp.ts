/**
 * Local SDP offer normalization for SFU video consumers.
 *
 * WHY THIS EXISTS
 * ---------------
 * The media-service answers consumer offers with the payload types pinned in
 * its mediasoup router (media-service/video-streaming/src/sfu/router.rs), and
 * mediasoup sends RTP on the wire with those same payload types — it cannot
 * renumber them per consumer. A browser, however, demuxes and decodes inbound
 * RTP strictly according to the payload-type table of its OWN local offer;
 * payload types that the answer redefines or introduces are ignored.
 *
 * Until Chrome 150 this worked by numeric coincidence: Chrome's default offer
 * mapped H264 42001f/packetization-mode=1 to PT 103, exactly the router pin.
 * Chrome 151 renumbered its default table (H264 Baseline moved to 102 and
 * PT 103 became the RTX slot for it), so the SFU's "103 = H264" answer made
 * Chrome treat every incoming packet as a retransmission blob: ICE and DTLS
 * connect, inbound-rtp packet counters climb, but framesDecoded stays 0 and
 * the receiver emits a NACK storm.
 *
 * The fix is to stop depending on the browser's default numbering: before
 * setLocalDescription, rewrite the video section of the local offer so the
 * codecs the SFU can send are advertised with the router's exact payload
 * types. The browser then installs precisely the mapping the SFU transmits
 * with, on every Chrome version (verified against Chrome 147 and 151).
 *
 * The table below MUST mirror router.rs media_codecs(). Audio is untouched
 * (Opus has kept PT 111 across Chrome versions, matching the router pin).
 */

interface CodecLines {
  rtpmap: string;
  fmtp: string[];
  rtcpFb: string[];
}

interface CanonicalCodec {
  /** Router-pinned payload type (router.rs media_codecs()). */
  targetPt: number;
  /** Human tag for debugging. */
  tag: string;
}

const VP8_PT = 96;
const VP9_PT = 98;
const H264_PM1_PROFILE_PTS: Record<string, number> = {
  "42001f": 103,
  "42e01f": 109,
  "4d001f": 117,
  "64001f": 119,
};

const codecLinePattern = /^a=(rtpmap|fmtp|rtcp-fb):(\d+)(?:\s|$)/;

function parseFmtpParams(fmtpLine: string): Record<string, string> {
  const params: Record<string, string> = {};
  const space = fmtpLine.indexOf(" ");
  if (space === -1) return params;
  for (const part of fmtpLine.slice(space + 1).split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) {
      params[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
  }
  return params;
}

function renumberLines(lines: CodecLines, oldPt: string, newPt: number): string[] {
  const swap = (line: string) =>
    line.replace(new RegExp(`^(a=(?:rtpmap|fmtp|rtcp-fb):)${oldPt}(?=\\s|$)`), `$1${newPt}`);
  return [lines.rtpmap, ...lines.rtcpFb, ...lines.fmtp].map(swap);
}

/**
 * Rewrite every video m-section of a local SDP offer to advertise only the
 * SFU-supported codecs, renumbered to the media-service router's payload
 * types. Non-video sections and non-codec attributes are preserved verbatim.
 *
 * Returns the input unchanged when no video section or no supported codec is
 * found, so callers can use it unconditionally.
 */
export function normalizeVideoOfferSdp(sdp: string): string {
  if (!sdp.includes("m=video")) return sdp;

  const newline = sdp.includes("\r\n") ? "\r\n" : "\n";
  const lines = sdp.split(newline);
  const output: string[] = [];

  let inVideoSection = false;
  let sectionStart = -1;

  const flushVideoSection = (sectionLines: string[]): string[] => {
    // Collect codec lines per payload type.
    const codecs = new Map<string, CodecLines>();
    for (const line of sectionLines) {
      const m = line.match(codecLinePattern);
      if (!m) continue;
      const pt = m[2];
      const entry = codecs.get(pt) ?? { rtpmap: "", fmtp: [], rtcpFb: [] };
      if (m[1] === "rtpmap") entry.rtpmap = line;
      else if (m[1] === "fmtp") entry.fmtp.push(line);
      else entry.rtcpFb.push(line);
      codecs.set(pt, entry);
    }

    // Pick the canonical codec set from what the browser actually offered.
    const selected: Array<{ oldPt: string; codec: CanonicalCodec }> = [];
    const h264Pm1: Array<{ oldPt: string; profile: string }> = [];

    for (const [pt, entry] of codecs) {
      if (!entry.rtpmap) continue;
      const rtpmapValue = entry.rtpmap.slice(entry.rtpmap.indexOf(" ") + 1).toUpperCase();
      if (rtpmapValue.startsWith("VP8/")) {
        if (!selected.some((s) => s.codec.targetPt === VP8_PT)) {
          selected.push({ oldPt: pt, codec: { targetPt: VP8_PT, tag: "VP8" } });
        }
      } else if (rtpmapValue.startsWith("VP9/")) {
        const params = parseFmtpParams(entry.fmtp[0] ?? "");
        const profile = params["profile-id"] ?? "0";
        if (profile === "0" && !selected.some((s) => s.codec.targetPt === VP9_PT)) {
          selected.push({ oldPt: pt, codec: { targetPt: VP9_PT, tag: "VP9" } });
        }
      } else if (rtpmapValue.startsWith("H264/")) {
        const params = parseFmtpParams(entry.fmtp[0] ?? "");
        if (params["packetization-mode"] === "1" && params["profile-level-id"]) {
          h264Pm1.push({ oldPt: pt, profile: params["profile-level-id"].toLowerCase() });
        }
      }
    }

    // Keep each advertised profile on its exact router pin. Safari only
    // offers Constrained Baseline; retain it at 109 for real H264 producers
    // and add the Baseline compatibility entry at 103 for aiortc producers.
    // The service normalizes only the compatibility slot (103). Keep the
    // original profile in the local SDP: WebKit rejects an invented 42001f
    // decoder capability. The exact Constrained Baseline slot stays at 109.
    const baseline = h264Pm1.find((c) => c.profile === "42001f");
    const constrainedBaseline = h264Pm1.find((c) => c.profile === "42e01f");
    if (!baseline && constrainedBaseline) {
      selected.push({
        oldPt: constrainedBaseline.oldPt,
        codec: { targetPt: 103, tag: "H264-42001f" },
      });
    }
    const claimedProfiles = new Set<string>();
    for (const { oldPt, profile } of h264Pm1) {
      const targetPt = H264_PM1_PROFILE_PTS[profile];
      if (targetPt !== undefined && !claimedProfiles.has(profile)) {
        claimedProfiles.add(profile);
        selected.push({ oldPt, codec: { targetPt, tag: `H264-${profile}` } });
      }
    }

    if (selected.length === 0) {
      // Nothing we recognize — leave the section untouched.
      return sectionLines;
    }
    selected.sort((a, b) => a.codec.targetPt - b.codec.targetPt);

    const rebuilt: string[] = [];
    let codecBlockEmitted = false;
    for (const line of sectionLines) {
      if (line.startsWith("m=video")) {
        const parts = line.split(" ");
        rebuilt.push(
          `${parts[0]} ${parts[1]} ${parts[2]} ${selected.map((s) => s.codec.targetPt).join(" ")}`,
        );
        continue;
      }
      if (codecLinePattern.test(line)) {
        // Replace the first codec line with the full renumbered codec block;
        // drop every other original codec line.
        if (!codecBlockEmitted) {
          codecBlockEmitted = true;
          for (const { oldPt, codec } of selected) {
            const codecLines = codecs.get(oldPt);
            if (codecLines) {
              rebuilt.push(...renumberLines(codecLines, oldPt, codec.targetPt));
            }
          }
        }
        continue;
      }
      rebuilt.push(line);
    }
    return rebuilt;
  };

  for (let i = 0; i <= lines.length; i++) {
    const line = lines[i];
    const isSectionBoundary = i === lines.length || (line !== undefined && line.startsWith("m="));
    if (isSectionBoundary && inVideoSection) {
      output.push(...flushVideoSection(lines.slice(sectionStart, i)));
      inVideoSection = false;
    }
    if (i === lines.length) break;
    if (line.startsWith("m=video")) {
      inVideoSection = true;
      sectionStart = i;
      continue;
    }
    if (!inVideoSection) {
      output.push(line);
    }
  }

  return output.join(newline);
}
