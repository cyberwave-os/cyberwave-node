import './lab.css';
import { cyberwave } from './api.ts';
import { sampleRoute } from './simulation.ts';
import { drawPlan, node } from './lab-view.ts';
import type { Position } from './domain.ts';

async function start() {
  const snapshot = await cyberwave.snapshot();
  node('context').textContent = `${snapshot.mode === 'fixture' ? 'Fixture data' : 'Local Cyberwave data'} · ${snapshot.environmentUuid}`;
  const target = node<HTMLSelectElement>('target');
  for (const twin of snapshot.twins) { const option = document.createElement('option'); option.value = twin.uuid; option.textContent = twin.name; target.append(option); }
  let observed: Position, points: Position[], elapsed = 0, running = false, previous = performance.now();
  const speed = node<HTMLInputElement>('speed'), seek = node<HTMLInputElement>('seek');
  function render() {
    const result = sampleRoute(points, Number(speed.value), elapsed);
    elapsed = Math.min(elapsed, result.duration); seek.max = `${result.duration}`; seek.value = `${elapsed}`;
    drawPlan(observed, result.position, points);
    node('pose').textContent = `Preview: ${result.position.x.toFixed(2)}, ${result.position.y.toFixed(2)}, ${result.position.z.toFixed(2)} m`;
    node('clock').textContent = `${elapsed.toFixed(2)} / ${result.duration.toFixed(2)} s`;
    if (result.complete) running = false;
    node<HTMLButtonElement>('play').disabled = running || result.complete;
    node<HTMLButtonElement>('pause').disabled = !running;
  }
  function reset() {
    running = false; elapsed = 0;
    const twin = snapshot.twins.find(t => t.uuid === target.value);
    if (!twin) throw new Error('No accessible twin is available.');
    observed = { ...twin.position }; points = [observed, ...snapshot.waypoints.map(p => ({ ...p.position }))];
    if (points.length < 2) {
      points.push({ ...observed, x: observed.x + 2 }, { ...observed, x: observed.x + 2, y: observed.y + 2 });
      node('status').textContent = 'No saved waypoints: preview uses a local synthetic route.';
    }
    node('route').replaceChildren(...points.map((p, i) => { const li = document.createElement('li'); li.textContent = `${i === 0 ? 'Observed start' : `Step ${i}`}: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}) m`; return li; }));
    render();
  }
  target.addEventListener('change', reset);
  speed.addEventListener('change', () => {
    const value = Number(speed.value);
    if (!Number.isFinite(value) || value < .1 || value > 100) speed.value = '20';
    reset();
  });
  node('play').addEventListener('click', () => { previous = performance.now(); running = true; render(); });
  node('pause').addEventListener('click', () => { running = false; render(); });
  node('reset').addEventListener('click', reset);
  seek.addEventListener('input', () => { running = false; elapsed = Number(seek.value); render(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { running = false; render(); } });
  reset();
  let frame = 0;
  const tick = (now: number) => { if (running) { elapsed += Math.min((now - previous) / 1000, .1); render(); } previous = now; frame = requestAnimationFrame(tick); };
  frame = requestAnimationFrame(tick);
  window.addEventListener('pagehide', () => cancelAnimationFrame(frame), { once: true });
}
void start().catch(error => { node('status').textContent = error.message; });
