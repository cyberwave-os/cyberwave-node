import test from 'node:test';
import assert from 'node:assert/strict';
import { compileNavigation, enuToLocal, localToEnu, reduceDraft, validateDraft } from '../src/domain.ts';
const point = { id: 'station', name: 'Station', position: { x: 12, y: -8, z: 0 } };

test('draft edits isolate desired state from observed data', () => {
  const original = { revision: 0, points: [] };
  const next = reduceDraft(original, { type: 'append', point });
  next.points[0].position.x = 99;
  assert.equal(original.points.length, 0);
  assert.equal(point.position.x, 12);
  assert.equal(next.revision, 1);
});
test('reordering invalidates a validated revision without mutating the prior draft', () => {
  const draft = { revision: 3, points: [point, { ...point, id: 'return' }] };
  const next = reduceDraft(draft, { type: 'move', index: 1, offset: -1 });
  assert.equal(next.revision, 4);
  assert.deepEqual(next.points.map(p => p.id), ['return', 'station']);
  assert.deepEqual(draft.points.map(p => p.id), ['station', 'return']);
});
test('navigation uses local Cartesian meters and the current API waypoint shape', () => {
  const payload = compileNavigation({ revision: 1, points: [point] }, 'environment');
  assert.deepEqual(payload, { command: 'path', environment_uuid: 'environment', source_type: 'tele',
    waypoints: [{ id: 'station', position: { x: 12, y: -8, z: 0 } }] });
  assert.equal('geodetic_position' in payload.waypoints[0], false);
});
test('nonfinite and empty drafts cannot compile commands', () => {
  assert.ok(validateDraft({ revision: 0, points: [] }).length);
  assert.throws(() => compileNavigation({ revision: 1, points: [{ ...point, position: { x: Infinity, y: 0, z: 0 } }] }, 'environment'));
});
test('local ENU yaw transform preserves East/North axes and round trips', () => {
  const north = localToEnu({ x: 10, y: 0, z: 3 }, 90);
  assert.ok(Math.abs(north.x) < 1e-10);
  assert.ok(Math.abs(north.y - 10) < 1e-10);
  for (const yaw of [0, 35, 90, -170]) {
    const restored = enuToLocal(localToEnu(point.position, yaw), yaw);
    assert.ok(Math.abs(restored.x - point.position.x) < 1e-10);
    assert.ok(Math.abs(restored.y - point.position.y) < 1e-10);
    assert.equal(restored.z, point.position.z);
  }
});
