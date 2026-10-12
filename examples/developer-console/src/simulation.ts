import type { Position } from './domain.ts';

/** Explicit elapsed time makes pause, seek and renderer substitution deterministic. */
export function sampleRoute(points: Position[], speed: number, elapsed: number) {
  if (!points.length || !points.every(p => [p.x, p.y, p.z].every(Number.isFinite))
      || !Number.isFinite(speed) || speed <= 0 || !Number.isFinite(elapsed) || elapsed < 0)
    throw new Error('A finite route, positive speed and nonnegative time are required.');
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y, p.z - points[i].z));
  const length = lengths.reduce((sum, distance) => sum + distance, 0);
  let remaining = Math.min(elapsed * speed, length);
  for (let i = 0; i < lengths.length; i++) {
    if (lengths[i] === 0) continue;
    if (remaining <= lengths[i]) {
      const t = remaining / lengths[i], a = points[i], b = points[i + 1];
      return { position: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t },
        duration: length / speed, complete: elapsed * speed >= length };
    }
    remaining -= lengths[i];
  }
  return { position: { ...points.at(-1)! }, duration: length / speed, complete: true };
}

export type Velocity = { linear_x: number; linear_y: number; angular_z: number };
export type Limits = { linear: number; angular: number };
export const INPUT_KEYS = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'Space'];

/** Custom keyboard layout produces controller intent, never a twin pose mutation. */
export function keyboardVelocity(keys: string[], limits: Limits): Velocity {
  if (!Array.isArray(keys) || keys.length > INPUT_KEYS.length || keys.some(key => !INPUT_KEYS.includes(key)))
    throw new Error('Unknown keyboard input.');
  if (![limits.linear, limits.angular].every(value => Number.isFinite(value) && value > 0))
    throw new Error('Invalid controller limits.');
  const held = new Set(keys), down = (key: string) => Number(held.has(key));
  if (!held.has('Space')) return { linear_x: 0, linear_y: 0, angular_z: 0 };
  let x = down('KeyW') - down('KeyS'), y = down('KeyA') - down('KeyD');
  const scale = Math.max(1, Math.hypot(x, y)); x /= scale; y /= scale;
  return { linear_x: x * limits.linear, linear_y: y * limits.linear,
    angular_z: (down('KeyQ') - down('KeyE')) * limits.angular };
}

export function velocityPacket(velocity: Velocity, now: number) {
  return { source_type: 'sim_tele' as const, command: 'locomotion_velocity', timestamp: now / 1000,
    data: { contract: 'locomotion.velocity_command.v1', ...velocity, duration_ms: 300,
      gait: Object.values(velocity).some(Boolean) ? 'walk' : 'stand', origin: 'teleop' } };
}

/** Kinematic reference consumer, not an ONNX controller or a physics simulator. */
export function createVelocityPreview(limits: Limits, initial: Position = { x: 0, y: 0, z: 0 }) {
  let position = { ...initial }, heading = 0, lastTick: number | null = null, expires = 0;
  let velocity: Velocity = { linear_x: 0, linear_y: 0, angular_z: 0 };
  function tick(now: number) {
    if (lastTick !== null) {
      const seconds = Math.max(0, Math.min(now, expires) - lastTick) / 1000;
      // Integrate only the command's valid interval, including a long renderer pause.
      const turn = velocity.angular_z * seconds;
      const sinc = turn === 0 ? 1 : Math.sin(turn / 2) / (turn / 2);
      const mid = heading + turn / 2;
      position.x += (velocity.linear_x * Math.cos(mid) - velocity.linear_y * Math.sin(mid)) * seconds * sinc;
      position.y += (velocity.linear_x * Math.sin(mid) + velocity.linear_y * Math.cos(mid)) * seconds * sinc;
      heading += turn;
    }
    lastTick = now;
    if (now >= expires) velocity = { linear_x: 0, linear_y: 0, angular_z: 0 };
    return { position: { ...position }, heading, velocity: { ...velocity }, expired: now >= expires };
  }
  function accept(packet: ReturnType<typeof velocityPacket>, now: number) {
    const data = packet?.data;
    if (packet?.source_type !== 'sim_tele' || packet.command !== 'locomotion_velocity'
        || data?.contract !== 'locomotion.velocity_command.v1' || !Number.isFinite(packet.timestamp)
        || now - packet.timestamp * 1000 > 300 || packet.timestamp * 1000 > now + 100
        || ![data.linear_x, data.linear_y, data.angular_z, data.duration_ms].every(Number.isFinite)
        || data.duration_ms <= 0 || data.duration_ms > 300
        || Math.hypot(data.linear_x, data.linear_y) > limits.linear + 1e-9 || Math.abs(data.angular_z) > limits.angular)
      throw new Error('Invalid or stale simulation controller input.');
    tick(now);
    velocity = { linear_x: data.linear_x, linear_y: data.linear_y, angular_z: data.angular_z };
    expires = packet.timestamp * 1000 + data.duration_ms;
  }
  return { tick, accept };
}
