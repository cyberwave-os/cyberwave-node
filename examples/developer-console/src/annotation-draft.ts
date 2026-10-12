import type { SampleAnnotation } from "cyberwave";

/** Compare stored labels with an editor round-trip, ignoring nullable polygon encoding
 * and sub-pixel floating-point noise (coordinates are normalized to [0, 1]). */
export function sameAnnotations(
  a: SampleAnnotation[],
  b: SampleAnnotation[],
): boolean {
  const coordinates = (left: number[], right: number[]) =>
    left.length === right.length &&
    left.every((value, index) => Math.abs(value - right[index]) <= 1e-12);
  return (
    a.length === b.length &&
    a.every((value, index) => {
      const other = b[index];
      return (
        value.label === other.label &&
        coordinates(value.bbox, other.bbox) &&
        (value.polygon ?? []).length === (other.polygon ?? []).length &&
        (value.polygon ?? []).every((point, vertex) =>
          coordinates(point, other.polygon![vertex]),
        )
      );
    })
  );
}
