"use client";
import { useEffect, useRef, useState } from "react";
import type {
  ImageAnnotator,
  ImageAnnotation,
  UserSelectAction,
} from "@annotorious/annotorious";
import type { SampleAnnotation } from "cyberwave";
import { fromImageAnnotations, toImageAnnotations } from "./geometry.js";

/** Controlled editor. The host owns source identity, persistence and review revisions. */
export function ImageAnnotationEditor({
  src,
  value,
  onChange,
  onValidityChange,
  readOnly = false,
  alt = "Image to annotate",
}: {
  src: string;
  value: SampleAnnotation[];
  onChange: (value: SampleAnnotation[]) => void;
  onValidityChange?: (valid: boolean) => void;
  readOnly?: boolean;
  alt?: string;
}) {
  const image = useRef<HTMLImageElement>(null),
    editor = useRef<ImageAnnotator | null>(null);
  const current = useRef({ value, onChange, onValidityChange, readOnly });
  current.current = { value, onChange, onValidityChange, readOnly };
  const [loadedSrc, setLoadedSrc] = useState(""),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [tool, setTool] = useState<"select" | "rectangle" | "polygon">("select");
  const [label, setLabel] = useState("object"),
    [selected, setSelected] = useState<ImageAnnotation>();
  const drawingLabel = useRef(label);
  drawingLabel.current = label;
  const emitted = useRef("");
  function fail(message: string) {
    setError(message);
    current.current.onValidityChange?.(false);
  }
  function emit() {
    const instance = editor.current,
      img = image.current;
    if (!instance || !img) return;
    try {
      const values = fromImageAnnotations(
        instance.getAnnotations(),
        img.naturalWidth,
        img.naturalHeight,
      );
      emitted.current = JSON.stringify(values);
      current.current.onChange(values);
      setError("");
      current.current.onValidityChange?.(values.every((v) => !!v.label.trim()));
    } catch (e) {
      fail((e as Error).message);
    }
  }
  useEffect(() => {
    setError("");
    setSelected(undefined);
    current.current.onValidityChange?.(false);
  }, [src]);
  useEffect(() => {
    if (loadedSrc !== src || !image.current) return;
    let disposed = false;
    import("@annotorious/annotorious")
      .then(({ createImageAnnotator }) => {
        if (disposed || !image.current) return;
        const img = image.current;
        const instance = createImageAnnotator(img, {
          autoSave: true,
          drawingEnabled: !current.current.readOnly,
          theme: "dark",
          disableUndoRedoKeys: true,
          style: {
            fill: "#38bdf8",
            fillOpacity: 0.15,
            stroke: "#71e4d0",
            strokeWidth: 2,
          },
        });
        editor.current = instance;
        instance.setAnnotations(
          toImageAnnotations(
            current.current.value,
            img.naturalWidth,
            img.naturalHeight,
          ),
        );
        instance.on("createAnnotation", (annotation) => {
          if (!annotation.bodies.length)
            instance.updateAnnotation({
              ...annotation,
              bodies: [
                {
                  id: crypto.randomUUID(),
                  annotation: annotation.id,
                  purpose: "tagging",
                  value: drawingLabel.current.trim(),
                },
              ],
            });
          emit();
          setTool("select");
          instance.setSelected(annotation.id, true);
        });
        instance.on("updateAnnotation", emit);
        instance.on("deleteAnnotation", emit);
        instance.on("selectionChanged", (selection) => {
          setSelected(selection[0]);
          if (selection[0])
            setLabel(
              selection[0].bodies.find((body) => body.purpose === "tagging")
                ?.value || "",
            );
        });
        setReady(true);
        emit();
      })
      .catch((e) => {
        if (!disposed) fail(e.message);
      });
    return () => {
      disposed = true;
      editor.current?.destroy();
      editor.current = null;
      setReady(false);
    };
  }, [loadedSrc, src]);
  useEffect(() => {
    const instance = editor.current,
      img = image.current;
    if (instance && img && JSON.stringify(value) !== emitted.current) {
      try {
        instance.setAnnotations(
          toImageAnnotations(value, img.naturalWidth, img.naturalHeight),
        );
        setSelected(undefined);
        emit();
      } catch (e) {
        fail((e as Error).message);
      }
    }
  }, [value, ready]);
  useEffect(() => {
    const instance = editor.current;
    if (!instance) return;
    instance.cancelDrawing();
    if (readOnly || tool !== "select") instance.setSelected();
    if (tool !== "select") instance.setDrawingTool(tool);
    instance.setDrawingMode(tool === "polygon" ? "click" : "drag");
    instance.setDrawingEnabled(!readOnly && tool !== "select");
    instance.setUserSelectAction(
      (readOnly
        ? "SELECT"
        : tool === "select"
          ? "EDIT"
          : "NONE") as UserSelectAction,
    );
  }, [tool, readOnly, ready]);
  function rename() {
    const latest = selected && editor.current?.getAnnotationById(selected.id);
    if (!latest || readOnly) return;
    editor.current!.updateAnnotation({
      ...latest,
      bodies: [
        {
          id: crypto.randomUUID(),
          annotation: latest.id,
          purpose: "tagging",
          value: label.trim(),
        },
      ],
    });
    emit();
  }
  function remove() {
    if (!editor.current || !selected || readOnly) return;
    editor.current.removeAnnotation(selected.id);
    setSelected(undefined);
    emit();
  }
  return (
    <section className="cw-annotation-editor">
      {!readOnly && (
        <div className="cw-annotation-toolbar">
          <label>
            Drawing tool
            <select
              disabled={!ready}
              value={tool}
              onChange={(e) => setTool(e.target.value as typeof tool)}
            >
              <option value="select">Select / edit</option>
              <option value="rectangle">Rectangle</option>
              <option value="polygon">Polygon</option>
            </select>
          </label>
          <label>
            Object label
            <input
              maxLength={100}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="cw-button"
            disabled={!selected || !label.trim()}
            onClick={rename}
          >
            Apply label
          </button>
          <button
            type="button"
            className="cw-button"
            disabled={!selected}
            onClick={remove}
          >
            Remove selected
          </button>
        </div>
      )}
      <div className="cw-annotation-image">
        <img
          key={src}
          ref={image}
          src={src}
          alt={alt}
          onLoad={() => setLoadedSrc(src)}
          onError={() => fail("Could not load the source image.")}
        />
      </div>
      {!readOnly && (
        <p className="cw-status">
          Drag to draw a box. For a polygon, click each corner and close it on
          the first point. Choose Select / edit to adjust an existing region.{" "}
          {value.length} objects.
        </p>
      )}
      {error && (
        <p role="alert" className="cw-error">
          {error}
        </p>
      )}
    </section>
  );
}
