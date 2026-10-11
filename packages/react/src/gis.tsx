"use client";
import { useEffect, useRef, useState } from "react";
import { validMapLocation, type MapLocation } from "cyberwave";
import type { Viewer, ImageryProvider } from "cesium";

/** Optional Cesium entry. No command dispatch, coordinate conversion, token or implicit remote basemap. */
export function LocationMap({
  locations,
  selectedId,
  onSelect,
  imageryProvider,
}: {
  locations: MapLocation[];
  selectedId?: string;
  onSelect: (id: string) => void;
  imageryProvider?: () => ImageryProvider | Promise<ImageryProvider>;
}) {
  const container = useRef<HTMLDivElement>(null),
    select = useRef(onSelect);
  select.current = onSelect;
  const [runtime, setRuntime] = useState<{
    viewer: Viewer;
    cesium: typeof import("cesium");
  }>();
  const [error, setError] = useState("");
  const valid = locations.filter(validMapLocation);
  useEffect(() => {
    let disposed = false,
      viewer: Viewer | undefined,
      cleanup: (() => void) | undefined;
    setRuntime(undefined);
    setError("");
    void (async () => {
      try {
        const C = await import("cesium");
        const imagery = imageryProvider
          ? await imageryProvider()
          : new C.GridImageryProvider({
              color: C.Color.fromCssColorString("#375770"),
              backgroundColor: C.Color.fromCssColorString("#112535"),
            });
        if (disposed) return;
        viewer = new C.Viewer(container.current!, {
          baseLayer: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          animation: false,
          timeline: false,
          navigationHelpButton: false,
          sceneModePicker: false,
          infoBox: false,
          selectionIndicator: false,
          skyBox: false,
          skyAtmosphere: false,
          sceneMode: C.SceneMode.SCENE2D,
          requestRenderMode: true,
        });
        viewer.imageryLayers.addImageryProvider(imagery);
        const events = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
        events.setInputAction(
          (event: { position: import("cesium").Cartesian2 }) => {
            const entity = viewer?.scene.pick(event.position)?.id;
            if (entity instanceof C.Entity) select.current(entity.id);
          },
          C.ScreenSpaceEventType.LEFT_CLICK,
        );
        const removeErrorListener = imagery.errorEvent.addEventListener(() => {
          if (!disposed)
            setError(
              "Basemap could not load. Locations remain selectable in the list.",
            );
        });
        cleanup = () => {
          events.destroy();
          removeErrorListener();
        };
        setRuntime({ viewer, cesium: C });
      } catch (e) {
        if (!disposed)
          setError(
            `Map unavailable: ${(e as Error).message}. Use the location list.`,
          );
      }
    })();
    return () => {
      disposed = true;
      cleanup?.();
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    };
  }, [imageryProvider]);
  useEffect(() => {
    if (!runtime || runtime.viewer.isDestroyed()) return;
    const { viewer, cesium: C } = runtime;
    viewer.entities.removeAll();
    for (const p of locations.filter(validMapLocation))
      viewer.entities.add({
        id: p.id,
        name: p.label,
        position: C.Cartesian3.fromDegrees(p.longitude, p.latitude),
        point: {
          pixelSize: p.id === selectedId ? 18 : 12,
          color: C.Color.fromCssColorString(p.color || "#38bdf8"),
          outlineColor: C.Color.WHITE,
          outlineWidth: p.id === selectedId ? 3 : 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: p.label,
          font: "13px sans-serif",
          fillColor: C.Color.WHITE,
          showBackground: true,
          backgroundColor: C.Color.fromCssColorString("#111820"),
          pixelOffset: new C.Cartesian2(0, -27),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    viewer.scene.requestRender();
  }, [runtime, locations, selectedId]);
  function fit() {
    if (
      !runtime ||
      runtime.viewer.isDestroyed() ||
      !runtime.viewer.entities.values.length
    )
      return;
    const C = runtime.cesium;
    const bounds = C.BoundingSphere.fromPoints(
      locations
        .filter(validMapLocation)
        .map((p) => C.Cartesian3.fromDegrees(p.longitude, p.latitude)),
    );
    void runtime.viewer.zoomTo(
      runtime.viewer.entities,
      new C.HeadingPitchRange(
        0,
        -Math.PI / 2,
        Math.max(1500, bounds.radius * 4.5),
      ),
    );
  }
  useEffect(() => {
    fit();
  }, [runtime, locations]);
  return (
    <section className="cw-browser" aria-label="Location map">
      <div className="cw-sensor-heading">
        <span>
          {valid.length} mapped · {locations.length - valid.length} invalid
          locations omitted
        </span>
        <button
          type="button"
          className="cw-button"
          onClick={fit}
          disabled={!runtime || !valid.length}
        >
          Fit locations
        </button>
      </div>
      <div className="cw-map-canvas" ref={container} />
      {error && (
        <p role="alert" className="cw-error">
          {error}
        </p>
      )}
      {!valid.length && (
        <p>
          No confirmed geographic locations. Unmapped resources remain available
          in the application list.
        </p>
      )}
      <div className="cw-map-location-list" aria-label="Map locations">
        {valid.map((p) => (
          <button
            type="button"
            key={p.id}
            className="cw-button"
            aria-pressed={p.id === selectedId}
            onClick={() => onSelect(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </section>
  );
}
