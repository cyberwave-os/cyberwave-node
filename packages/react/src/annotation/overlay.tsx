"use client";
import { useId, useMemo } from "react";
import type { StructuredImageAction } from "cyberwave";
import { imageMarks, type ImageModelResult } from "./model.js";
export function ModelResultOverlay({
  src,
  action,
  result,
}: {
  src: string;
  action: StructuredImageAction;
  result: ImageModelResult;
}) {
  const id = useId().replace(/:/g, "");
  const parsed = useMemo(() => {
    try {
      return { marks: imageMarks(action, result) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [action, result]);
  if (parsed.error)
    return (
      <p role="alert" className="cw-error">
        {parsed.error}
      </p>
    );
  return (
    <figure className="cw-model-overlay">
      <img src={src} alt="Model input" />
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        role="img"
        aria-label={action.label}
      >
        {action.image_annotation?.kind === "trajectory" && (
          <polyline
            points={parsed
              .marks!.map((mark) => mark.point!.map((v) => v * 1000).join(","))
              .join(" ")}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {parsed.marks!.map((mark, i) => {
          const [left, top, right, bottom] = mark.bbox || [0, 0, 0, 0],
            x = left * 1000,
            y = top * 1000,
            w = (right - left) * 1000,
            h = (bottom - top) * 1000,
            maskId = `cw-mask-${id}-${i}`;
          return (
            <g key={i}>
              <title>{mark.label}</title>
              {mark.mask && (
                <>
                  <defs>
                    <mask
                      id={maskId}
                      maskUnits="userSpaceOnUse"
                      maskContentUnits="userSpaceOnUse"
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      style={{ maskType: "luminance" }}
                    >
                      <image
                        href={mark.mask}
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        preserveAspectRatio="none"
                      />
                    </mask>
                  </defs>
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill="#71e4d0"
                    opacity={0.6}
                    mask={`url(#${maskId})`}
                  />
                </>
              )}
              {mark.bbox && (
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill="none"
                  stroke="#71e4d0"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {mark.point && (
                <ellipse
                  cx={mark.point[0] * 1000}
                  cy={mark.point[1] * 1000}
                  rx={6}
                  ry={6}
                  fill="#38bdf8"
                />
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
