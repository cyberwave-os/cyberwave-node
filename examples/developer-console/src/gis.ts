/** Only projection and interaction. This module cannot dispatch commands. */
import {
  Cartesian3, Color, Entity, GridImageryProvider, HeightReference,
  Matrix4, ScreenSpaceEventHandler, ScreenSpaceEventType, Transforms, Viewer,
} from 'cesium';
import type { Cartesian2 } from 'cesium';
import { enuToLocal, localToEnu } from './domain.ts';
import type { Anchor, Draft, Position, Twin, Waypoint } from './domain.ts';

export function createGis(container: HTMLElement, anchor: Anchor,
  onSelection: (point: Waypoint) => void, onGroundPick: (point: Position) => void) {
  const viewer = new Viewer(container, { baseLayer: false, baseLayerPicker: false,
    geocoder: false, homeButton: false, animation: false, timeline: false,
    navigationHelpButton: false, sceneModePicker: true, infoBox: false,
    selectionIndicator: false, skyBox: false, skyAtmosphere: false });
  viewer.imageryLayers.addImageryProvider(new GridImageryProvider({
    color: Color.fromCssColorString('#50718f'), backgroundColor: Color.fromCssColorString('#152839'),
  }));
  const origin = Cartesian3.fromDegrees(anchor.longitude, anchor.latitude, anchor.height);
  const transform = Transforms.eastNorthUpToFixedFrame(origin);
  const inverse = Matrix4.inverseTransformation(transform, new Matrix4());
  const saved = new Map<string, Waypoint>();
  let route: Entity | undefined;
  let overlays: { name: string; points: Position[]; color: string }[] = [];

  function project(point: Position): Cartesian3 {
    const enu = localToEnu(point, anchor.yawDegrees);
    return Matrix4.multiplyByPoint(transform, new Cartesian3(enu.x, enu.y, enu.z), new Cartesian3());
  }

  const events = new ScreenSpaceEventHandler(viewer.scene.canvas);
  events.setInputAction((event: { position: Cartesian2 }) => {
    const picked = viewer.scene.pick(event.position);
    if (picked?.id instanceof Entity && saved.has(picked.id.id)) {
      const point = saved.get(picked.id.id)!;
      onSelection({ ...point, position: { ...point.position } });
      return;
    }
    const hit = viewer.camera.pickEllipsoid(event.position, viewer.scene.globe.ellipsoid);
    if (!hit) return;
    const enu = Matrix4.multiplyByPoint(inverse, hit, new Cartesian3());
    // Ground picks propose local XY only. Preserve navigation plane Z=0;
    // ellipsoid height is not a device altitude command.
    onGroundPick({ ...enuToLocal(enu, anchor.yawDegrees), z: 0 });
  }, ScreenSpaceEventType.LEFT_CLICK);

  function update(twins: Twin[], waypoints: Waypoint[], draft: Draft) {
    viewer.entities.removeAll(); saved.clear();
    for (const [index, overlay] of overlays.entries()) viewer.entities.add({ id: `overlay:${index}`, name: overlay.name,
      polygon: { hierarchy: overlay.points.map(project), material: Color.fromCssColorString(overlay.color).withAlpha(.3), perPositionHeight: true, outline: true, outlineColor: Color.fromCssColorString(overlay.color) } });
    for (const twin of twins) viewer.entities.add({ id: `twin:${twin.uuid}`, name: twin.name,
      position: project(twin.position), point: { pixelSize: 16, color: Color.AQUA,
        heightReference: HeightReference.NONE, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
    for (const waypoint of waypoints) {
      const id = `waypoint:${waypoint.id}`; saved.set(id, waypoint);
      viewer.entities.add({ id, name: waypoint.name, position: project(waypoint.position),
        point: { pixelSize: 12, color: Color.ORANGE, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
    }
    for (const [index, point] of draft.points.entries()) viewer.entities.add({
      id: `draft:${index}`, name: `Draft step ${index + 1}`, position: project(point.position),
      point: { pixelSize: 8, color: Color.LIME, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    });
    route = draft.points.length > 1 ? viewer.entities.add({ id: 'draft-route', polyline: {
      positions: draft.points.map(point => project(point.position)), width: 4, material: Color.LIME,
    } }) : undefined;
    viewer.scene.requestRender();
  }

  viewer.camera.setView({ destination: Cartesian3.fromDegrees(anchor.longitude, anchor.latitude, anchor.height + 600) });
  return { update, destroy: () => { events.destroy(); viewer.destroy(); },
    setOverlays: (value: typeof overlays) => { overlays = value; },
    focusRoute: () => { if (route) void viewer.zoomTo(route); } };
}
