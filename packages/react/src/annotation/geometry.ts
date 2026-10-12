import type {
  ImageAnnotation,
  Polygon,
  Rectangle,
} from "@annotorious/annotorious";
import type { SampleAnnotation } from "cyberwave";

export function toImageAnnotations(
  values: SampleAnnotation[],
  width: number,
  height: number,
): ImageAnnotation[] {
  return values.map((value, index) => {
    const id = `sample-${index}`,
      [left, top, right, bottom] = value.bbox;
    const bounds = {
      minX: left * width,
      minY: top * height,
      maxX: right * width,
      maxY: bottom * height,
    };
    const selector = value.polygon
      ? {
          type: "POLYGON",
          geometry: {
            bounds,
            points: value.polygon.map(([x, y]) => [x * width, y * height]),
          },
        }
      : {
          type: "RECTANGLE",
          geometry: {
            bounds,
            x: bounds.minX,
            y: bounds.minY,
            w: bounds.maxX - bounds.minX,
            h: bounds.maxY - bounds.minY,
          },
        };
    return {
      id,
      bodies: [
        {
          id: `label-${index}`,
          annotation: id,
          purpose: "tagging",
          value: value.label,
        },
      ],
      target: { annotation: id, selector },
    } as ImageAnnotation;
  });
}

export function fromImageAnnotations(
  values: ImageAnnotation[],
  width: number,
  height: number,
): SampleAnnotation[] {
  if (!(width > 0 && height > 0))
    throw new Error("Load the original image before annotating.");
  if (values.length > 500)
    throw new Error("Use at most 500 objects per image.");
  return values.map((value) => {
    const { type, geometry } = value.target.selector;
    if (type !== "RECTANGLE" && type !== "POLYGON")
      throw new Error("This dataset supports rectangles and polygons.");
    if (type === "RECTANGLE" && (geometry as Rectangle["geometry"]).rot)
      throw new Error("Rotated boxes are not supported.");
    const label =
      value.bodies.find((body) => body.purpose === "tagging")?.value || "";
    const { minX, minY, maxX, maxY } = geometry.bounds;
    const result: SampleAnnotation = {
      label,
      bbox: [minX / width, minY / height, maxX / width, maxY / height],
    };
    if (type === "POLYGON") {
      result.polygon = (geometry as Polygon["geometry"]).points.map(
        ([x, y]) => [x / width, y / height],
      );
      const area =
        Math.abs(
          result.polygon.reduce((sum, a, i, points) => {
            const b = points[(i + 1) % points.length];
            return sum + a[0] * b[1] - b[0] * a[1];
          }, 0),
        ) / 2;
      if (area <= 1e-12)
        throw new Error("Polygon must enclose a non-zero area.");
      if (result.polygon.length < 3 || result.polygon.length > 128)
        throw new Error("Use 3 to 128 polygon vertices.");
    }
    if (
      [...result.bbox, ...(result.polygon?.flat() || [])].some(
        (value) => !Number.isFinite(value) || value < 0 || value > 1,
      )
    )
      throw new Error("Keep every region inside the source image.");
    if (!(result.bbox[2] > result.bbox[0] && result.bbox[3] > result.bbox[1]))
      throw new Error("Regions must have positive area.");
    return result;
  });
}
