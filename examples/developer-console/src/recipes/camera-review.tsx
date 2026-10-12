"use client";
import { useState } from "react";
import { CyberwaveProvider } from "@cyberwave/react";
import { SensorVideoPanel } from "@cyberwave/react/video";
import {
  CapturedFrameReview,
  type CapturedFrame,
  type ReviewedFrame,
} from "@cyberwave/react/annotation";
import type { CyberwaveClient, Twin } from "cyberwave";
import type { VideoTarget } from "cyberwave/video";
import "@cyberwave/react/styles.css";
import "@cyberwave/react/annotation.css";

type Props = {
  client: CyberwaveClient;
  /** Change when the API/account/session is replaced; never use a token as a key. */
  sessionKey: string;
  twin: Twin;
  streamSource: "live" | "simulation";
  /** Use the producer's exact instance, including a simulation run ID. */
  streamInstanceId: string;
  rtcConfiguration?: RTCConfiguration;
  /** Host owns attachment upload, dataset selection, provenance and mutation reconciliation. */
  onConfirm: (
    review: ReviewedFrame & { target: VideoTarget },
    signal: AbortSignal,
  ) => Promise<void>;
};

/** Copy into your application: this is checked example code, not a new SDK export. */
export function CameraReview(props: Props) {
  return (
    <CyberwaveProvider client={props.client}>
      <CaptureStep
        key={JSON.stringify([
          props.sessionKey,
          props.twin.uuid,
          props.streamSource,
          props.streamInstanceId,
        ])}
        {...props}
      />
    </CyberwaveProvider>
  );
}
function CaptureStep({
  twin,
  streamSource,
  streamInstanceId,
  rtcConfiguration,
  onConfirm,
}: Props) {
  const [capture, setCapture] = useState<{
    frame: CapturedFrame;
    target: VideoTarget;
  }>();
  return (
    <>
      <SensorVideoPanel
        twin={twin}
        streamSource={streamSource}
        streamInstanceId={streamInstanceId}
        rtcConfiguration={rtcConfiguration}
        showCapturePreview={false}
        onCapture={(frame, target) => setCapture({ frame, target })}
      />
      {capture && (
        <CapturedFrameReview
          frame={capture.frame}
          onConfirm={(review, signal) =>
            onConfirm({ ...review, target: capture.target }, signal)
          }
        />
      )}
    </>
  );
}
