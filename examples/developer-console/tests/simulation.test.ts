import test from 'node:test';
import assert from 'node:assert/strict';
import { createVelocityPreview, keyboardVelocity, sampleRoute, velocityPacket } from '../src/simulation.ts';
const limits = { linear: .5, angular: .8 };
test('route sampling is deterministic, preserves the source and completes across zero-length segments', () => {
  const source = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }];
  assert.deepEqual(sampleRoute(source, 2, 1).position, { x: 2, y: 0, z: 0 });
  assert.deepEqual(sampleRoute(source, 2, 1), sampleRoute(source, 2, 1));
  assert.equal(sampleRoute(source, 2, 100).complete, true);
  assert.deepEqual(source[0], { x: 0, y: 0, z: 0 });
  assert.throws(() => sampleRoute(source, 0, 1));
});
test('Space gates input; opposing keys cancel and diagonals respect the controller limit', () => {
  assert.deepEqual(keyboardVelocity(['KeyW'], limits), { linear_x: 0, linear_y: 0, angular_z: 0 });
  assert.equal(keyboardVelocity(['Space', 'KeyW', 'KeyS'], limits).linear_x, 0);
  const diagonal = keyboardVelocity(['Space', 'KeyW', 'KeyA'], limits);
  assert.ok(Math.abs(Math.hypot(diagonal.linear_x, diagonal.linear_y) - .5) < 1e-10);
  assert.throws(() => keyboardVelocity(['Delete'], limits));
});
test('reference controller expires input even when rendering pauses, without changing observed state', () => {
  const observed = { x: 1, y: 2, z: 0 }, consumer = createVelocityPreview(limits, observed);
  consumer.accept(velocityPacket({ linear_x: .5, linear_y: 0, angular_z: 0 }, 1000), 1000);
  const result = consumer.tick(5000);
  assert.ok(Math.abs(result.position.x - 1.15) < 1e-10);
  assert.equal(result.expired, true);
  assert.equal(result.velocity.linear_x, 0);
  assert.deepEqual(observed, { x: 1, y: 2, z: 0 });
  assert.deepEqual(consumer.tick(6000).position, result.position);
});
test('stale, live-source and excessive controller inputs are rejected', () => {
  const consumer = createVelocityPreview(limits), packet = velocityPacket({ linear_x: .5, linear_y: 0, angular_z: 0 }, 1000);
  assert.throws(() => consumer.accept(packet, 1400));
  assert.throws(() => consumer.accept({ ...packet, source_type: 'tele' } as any, 1000));
  assert.throws(() => consumer.accept(velocityPacket({ linear_x: 2, linear_y: 0, angular_z: 0 }, 1000), 1000));
});
