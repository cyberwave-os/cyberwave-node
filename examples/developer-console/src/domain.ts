/** Renderer-independent drafting. No transport, Cesium, or application imports. */
export type Position = { x: number; y: number; z: number };
export type Waypoint = { id: string; name: string; position: Position };
export type Twin = { uuid: string; name: string; position: Position };
export type Draft = { revision: number; points: Waypoint[] };
export type Anchor = {
  longitude: number; latitude: number; height: number; yawDegrees: number;
};
export type Edit =
  | { type: 'append'; point: Waypoint }
  | { type: 'remove'; index: number }
  | { type: 'move'; index: number; offset: -1 | 1 }
  | { type: 'clear' };

export function isPosition(value: unknown): value is Position {
  if (!value || typeof value !== 'object') return false;
  const point = value as Position;
  return [point.x, point.y, point.z].every(n => typeof n === 'number' && Number.isFinite(n));
}

export function reduceDraft(draft: Draft, edit: Edit): Draft {
  const points = draft.points.map(point => ({ ...point, position: { ...point.position } }));
  if (edit.type === 'append') {
    if (!isPosition(edit.point.position)) throw new Error('Waypoint must contain finite coordinates.');
    points.push({ ...edit.point, position: { ...edit.point.position } });
  } else if (edit.type === 'remove') {
    points.splice(edit.index, 1);
  } else if (edit.type === 'clear') {
    points.length = 0;
  } else {
    const destination = edit.index + edit.offset;
    if (edit.index < 0 || edit.index >= points.length || destination < 0 || destination >= points.length) return draft;
    [points[edit.index], points[destination]] = [points[destination], points[edit.index]];
  }
  return { revision: draft.revision + 1, points };
}

export function validateDraft(draft: Draft): string[] {
  if (!draft || !Number.isSafeInteger(draft.revision) || draft.revision < 0) return ['Invalid draft revision.'];
  if (!Array.isArray(draft.points) || draft.points.length < 1 || draft.points.length > 100) return ['Choose between 1 and 100 waypoints.'];
  return draft.points.flatMap((point, index) =>
    !point || typeof point.id !== 'string' || !isPosition(point.position)
      ? [`Waypoint ${index + 1} is invalid.`] : []);
}

/** Current REST contract: environment-local Cartesian positions, not GIS degrees. */
export function compileNavigation(draft: Draft, environmentUuid: string) {
  const errors = validateDraft(draft);
  if (errors.length) throw new Error(errors.join(' '));
  return {
    command: 'path', environment_uuid: environmentUuid, source_type: 'tele',
    waypoints: draft.points.map(point => ({ id: point.id, position: { ...point.position } })),
  };
}

export function localToEnu(point: Position, yawDegrees: number): Position {
  const yaw = yawDegrees * Math.PI / 180;
  return { x: point.x * Math.cos(yaw) - point.y * Math.sin(yaw),
    y: point.x * Math.sin(yaw) + point.y * Math.cos(yaw), z: point.z };
}

export function enuToLocal(point: Position, yawDegrees: number): Position {
  return localToEnu(point, -yawDegrees);
}
