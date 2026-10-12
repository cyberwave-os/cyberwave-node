import './lab.css';
import { INPUT_KEYS } from './simulation.ts';
import { drawPlan, node } from './lab-view.ts';
import { request } from './api.ts';
export type Context = { name: string; twinUuid: string; policyUuid: string; transport: string; contract: string; limits: { linear: number; angular: number }; lateral: boolean };
export function mountKeyboardController(onPose?: (position: { x: number; y: number; z: number }, heading: number) => void) {
let enabled = true, generation = 0;
const pad = node('pad'), held = new Set<string>();
const leaseKey = 'cyberwave-example-controller-session';
let sessionId: string | null = null, sequence = 0, pending = false, polling = false, released = true, disposed = false;
let pulse: number | undefined;
let lastSubmit = 0;
const report = (message: string) => { node('status').textContent = message; };
function controls() {
  node<HTMLButtonElement>('open').disabled = !!sessionId || !enabled;
  for (const id of ['close', 'pulse', 'stop', 'arc']) { const button = document.getElementById(id) as HTMLButtonElement | null; if (button) button.disabled = !sessionId || !enabled; }
  node('keys').textContent = held.size ? [...held].join(' + ') : 'No keys held.';
}
function release() { clearTimeout(pulse); held.clear(); released = false; controls(); void submit(); }
async function submit() {
  if (!sessionId || pending || disposed) return;
  const moving = held.has('Space') && [...held].some(key => key !== 'Space');
  if (moving && performance.now() - lastSubmit < 50) return;
  lastSubmit = performance.now();
  pending = true;
  const keys = [...held], id = sessionId;
  try {
    const result = await request<{ packet: unknown; transport: string }>('/api/controller/input', { sessionId: id, sequence: ++sequence, sentAt: Date.now(), keys });
    if (sessionId !== id) return; // A closed/replaced session cannot update the new mode.
    node('packet').textContent = JSON.stringify(result.packet, null, 2);
    released = keys.length === 0 && held.size === 0;
  } catch (error) {
    if (sessionId !== id) return;
    report((error as Error).message); held.clear(); sessionId = null; controls();
    void request('/api/controller/close', { sessionId: id }).catch(() => {});
  }
  finally { pending = false;
    // A release arriving during a request is sent immediately after it; no setpoint queue.
    if (sessionId && held.size === 0 && keys.length > 0) void submit();
  }
}
async function activate() {
  if (!enabled || sessionId) return;
  const ownedGeneration = generation;
  node<HTMLButtonElement>('open').disabled = true;
  try {
    // Reloads can interrupt pagehide's close request. Keep only this tab's
    // owned ID, never adopt a session from the shared gateway state.
    const previous = sessionStorage.getItem(leaseKey);
    if (previous) {
      const response = await fetch('/api/controller/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: previous }) });
      if (!response.ok && response.status !== 409) throw new Error('Could not close this tab\'s previous input session. Retry activation.');
      sessionStorage.removeItem(leaseKey);
    }
    if (ownedGeneration !== generation || !enabled || disposed) return;
    const context = await request<Context & { sessionId: string }>('/api/controller/open', {});
    if (ownedGeneration !== generation || !enabled || disposed) { await request('/api/controller/close', { sessionId: context.sessionId }); return; }
    sessionStorage.setItem(leaseKey, context.sessionId);
    sessionId = context.sessionId; sequence = 0; held.clear(); released = true; controls();
    node('context').textContent = `${context.name} · ${context.transport} · ${context.contract}`;
    report('Session opened. Input is enabled only while Space is held in the focused pad.'); pad.focus();
  } catch (error) { if (ownedGeneration === generation) report((error as Error).message); controls(); }
}
node('open').addEventListener('click', () => void activate());
async function deactivate() {
  generation++;
  const id = sessionId; release(); sessionId = null; controls();
  if (id) { try { await request('/api/controller/close', { sessionId: id }); sessionStorage.removeItem(leaseKey); report('Input session closed.'); } catch (error) { report((error as Error).message); throw error; } }
}
node('close').addEventListener('click', () => void deactivate().catch(() => {}));
pad.addEventListener('keydown', event => {
  if (!sessionId || !INPUT_KEYS.includes(event.code) || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault(); held.add(event.code); released = false; controls(); void submit();
});
pad.addEventListener('keyup', event => {
  if (!INPUT_KEYS.includes(event.code)) return;
  event.preventDefault(); held.delete(event.code);
  if (event.code === 'Space') held.clear(); released = false; controls(); void submit();
});
pad.addEventListener('blur', release);
window.addEventListener('blur', release);
document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
node('stop').addEventListener('click', release);
node('pulse').addEventListener('click', () => {
  held.clear(); held.add('Space'); held.add('KeyW'); released = false; controls(); void submit();
  pulse = window.setTimeout(release, 250);
});
document.getElementById('arc')?.addEventListener('click', () => {
  held.clear(); held.add('Space'); held.add('KeyW'); held.add('KeyQ'); released = false; controls(); void submit();
  pulse = window.setTimeout(release, 1000);
});
const heartbeat = window.setInterval(() => { if (held.size || !released) void submit(); }, 100);
const timer = window.setInterval(async () => {
  if (polling || disposed || !sessionId) return; polling = true;
  const id = sessionId;
  try { const state = await request<{ active: boolean; received: number; transportError: string;
    preview?: { position: { x: number; y: number; z: number }; heading: number; expired: boolean } }>('/api/controller/state');
    if (disposed || sessionId !== id) return;
    if (!state.active && sessionId) { sessionId = null; held.clear(); controls(); report('Session ended; open a new session to resume.'); }
    if (state.preview && enabled) {
      if (onPose) { if (enabled) onPose(state.preview.position, state.preview.heading); }
      else drawPlan({ x: 0, y: 0, z: 0 }, state.preview.position, [], state.preview.heading);
      node('pose').textContent = `Preview x=${state.preview.position.x.toFixed(3)} m, y=${state.preview.position.y.toFixed(3)} m · ${state.preview.expired ? 'input expired / stopped' : 'latest bounded input'}`;
    }
    node('received').textContent = `Reference consumer received ${state.received} controller inputs.`;
    if (state.transportError && enabled) report(state.transportError);
  } catch (error) { report((error as Error).message); }
  finally { polling = false; }
}, 100);
window.addEventListener('pagehide', () => {
  disposed = true; clearInterval(timer); clearInterval(heartbeat); clearTimeout(pulse); held.clear();
  if (sessionId) void fetch('/api/controller/close', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }), keepalive: true }).catch(() => {});
  // Server/reference-consumer timeout remains the fallback when teardown cannot run.
}, { once: true });
void request<Context>('/api/controller/context').then(context => {
  node('context').textContent = `${context.name} · ${context.transport} · limit ${context.limits.linear} m/s, ${context.limits.angular} rad/s`;
}).catch(error => report(error.message));
if (!onPose) drawPlan({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, []); controls();
return { activate, deactivate, async setEnabled(value: boolean) { enabled = value; await deactivate(); controls(); pad.setAttribute('aria-disabled', `${!value}`); } };
}
if (location.pathname.endsWith('/keyboard-telecontrol.html')) mountKeyboardController();
