import './lab.css';
import { cyberwave, request } from './api.ts';
import { node } from './lab-view.ts';
import { mountKeyboardController } from './keyboard-telecontrol.ts';
import { createRobotView } from './robot-view.ts';
async function start() {
  const snapshot = await cyberwave.snapshot();
  const controllerContext = await request<{ twinUuid: string }>('/api/controller/context').catch(() => null);
  const targetUuid = controllerContext?.twinUuid || snapshot.twins[0]?.uuid;
  const view = createRobotView(node('robot-scene'), snapshot.anchor);
  let mode: 'simulation' | 'live' = 'simulation', disposed = false, polling = false;
  const controls = mountKeyboardController((position, heading) => { if (mode === 'simulation') view.update(position, heading, mode); });
  const selector = node<HTMLSelectElement>('runtime-mode');
  function describe() {
    node('status').textContent = mode === 'live' ? 'Simulation input closed. Live observation enabled.' : 'Simulation preview ready. Activate explicitly to accept input.';
    if (mode === 'simulation') { node('pose').textContent = 'Preview origin: 0, 0, 0 m'; node('received').textContent = ''; }
    node('open').textContent = mode === 'simulation' ? 'Activate simulation controller' : 'Live controller unavailable';
    node('view-source').textContent = mode === 'simulation' ? '3D source: bounded controller reference consumer' : `3D source: ${snapshot.mode === 'fixture' ? 'fixture observation' : 'local Cyberwave REST observation'}`;
    node('mode-detail').textContent = mode === 'simulation'
      ? 'Activate to open an input session. Commands feed a separate kinematic consumer; observed twin state stays unchanged.'
      : 'The simulation input session is closed. This view follows observed twin state. Live actuation needs a backend-prepared live input profile and an authorized edge runtime; the simulation-only controller cannot be promoted to live.';
  }
  async function observe() {
    if (polling || disposed || mode !== 'live') return; polling = true;
    try { const latest = await cyberwave.snapshot(); if (disposed || mode !== 'live') return;
      const twin = latest.twins.find(t => t.uuid === targetUuid);
      if (!twin) throw new Error('Observed target is unavailable.');
      view.update(twin.position, 0, 'live'); node('pose').textContent = `Observed ${twin.name}: ${twin.position.x.toFixed(3)}, ${twin.position.y.toFixed(3)}, ${twin.position.z.toFixed(3)} m · sampled ${new Date().toLocaleTimeString()}`;
    } catch (error) { node('status').textContent = (error as Error).message; }
    finally { polling = false; }
  }
  selector.addEventListener('change', async () => {
    selector.disabled = true;
    try { await controls.setEnabled(false); // Release, close and clear before choosing another runtime.
      mode = selector.value === 'live' ? 'live' : 'simulation'; describe();
      if (mode === 'simulation') { await controls.setEnabled(true); view.update({ x: 0, y: 0, z: 0 }, 0, mode); }
      else await observe();
    } catch (error) { selector.value = mode; node('status').textContent = (error as Error).message; }
    finally { selector.disabled = false; }
  });
  let lifecycleBusy = false;
  async function simulationStatus() {
    try { const state = await request<{ launchEnabled: boolean; outcomeUnknown: boolean; ownedId: string | null; active: { simulationId: string; status: string; ready: boolean }[] }>('/api/simulation/status');
      if (disposed) return;
      node<HTMLButtonElement>('sim-start').disabled = !state.launchEnabled || state.outcomeUnknown || !!state.ownedId || state.active.length > 0 || lifecycleBusy || mode !== 'simulation';
      node<HTMLButtonElement>('sim-stop').disabled = !state.ownedId || lifecycleBusy;
      node('sim-status').textContent = state.outcomeUnknown ? 'Start outcome unknown. Inspect Cyberwave before requesting another workload.' : state.active.length ? state.active.map(row => `${row.simulationId}: ${row.status} · readiness ${row.ready ? 'reported ready' : 'not confirmed'}`).join(' / ')
        : state.launchEnabled ? 'No active backend simulation. Requesting creates a workload; acceptance is not worker readiness.' : 'Backend launch disabled. Enable DEMO_ALLOW_SIMULATION_LAUNCH on the BFF for a dedicated local test environment.';
    } catch (error) { node('sim-status').textContent = (error as Error).message; }
  }
  for (const action of ['start', 'stop']) node(`sim-${action}`).addEventListener('click', async () => {
    if (lifecycleBusy) return; lifecycleBusy = true;
    node<HTMLButtonElement>('sim-start').disabled = true; node<HTMLButtonElement>('sim-stop').disabled = true;
    try { await controls.deactivate(); const result = await request<{ status: string }>(`/api/simulation/${action}`, {}); node('sim-status').textContent = `Backend ${result.status}`; }
    catch (error) { node('sim-status').textContent = (error as Error).message; }
    finally { lifecycleBusy = false; }
  });
  describe(); void simulationStatus(); const simTimer = window.setInterval(() => void simulationStatus(), 3000);
  const timer = window.setInterval(() => void observe(), 1000);
  window.addEventListener('pagehide', () => { disposed = true; clearInterval(timer); clearInterval(simTimer); view.destroy(); }, { once: true });
}
void start().catch(error => { node('status').textContent = error.message; });
