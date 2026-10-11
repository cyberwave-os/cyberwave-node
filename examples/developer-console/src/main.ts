import './style.css';
import { cyberwave } from './api.ts';
import type { Snapshot } from './api.ts';
import { createGis } from './gis.ts';
import { reduceDraft, validateDraft } from './domain.ts';
import type { Draft, Edit, Waypoint } from './domain.ts';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const target = element<HTMLSelectElement>('twin');
const report = (message: string, error = false) => {
  element('status').textContent = message; element('status').dataset.error = String(error);
};
const button = (label: string, action: () => void) => {
  const result = document.createElement('button'); result.textContent = label;
  result.addEventListener('click', action); return result;
};
let snapshot: Snapshot;
let draft: Draft = { revision: 0, points: [] };
let selected: Waypoint | null = null;
let validatedRevision: number | null = null;
let busy = false;
let active: { twinUuid: string; actionId: string } | null = null;
let frameUrl: string | null = null;
let gis: ReturnType<typeof createGis>;

function select(point: Waypoint) {
  selected = point;
  element('selection').textContent = `${point.name}: (${point.position.x.toFixed(1)}, ${point.position.y.toFixed(1)}, ${point.position.z.toFixed(1)}) m`;
  element<HTMLButtonElement>('append').disabled = busy;
}
function edit(action: Edit) {
  if (busy) return;
  draft = reduceDraft(draft, action); validatedRevision = null; render();
}
function render() {
  const list = element('draft'); list.replaceChildren();
  draft.points.forEach((point, index) => {
    const li = document.createElement('li'); li.textContent = point.name;
    li.append(button('↑', () => edit({ type: 'move', index, offset: -1 })),
      button('↓', () => edit({ type: 'move', index, offset: 1 })),
      button('Remove', () => edit({ type: 'remove', index })));
    list.append(li);
  });
  for (const control of Array.from(list.querySelectorAll('button'))) control.disabled = busy;
  target.disabled = busy;
  for (const id of ['clear', 'validate']) element<HTMLButtonElement>(id).disabled = busy;
  element<HTMLButtonElement>('append').disabled = busy || !selected;
  element<HTMLButtonElement>('execute').disabled = busy || !target.value || !snapshot.executionEnabled || validatedRevision !== draft.revision;
  element<HTMLButtonElement>('cancel').disabled = busy || !active || snapshot.mode === 'fixture';
  gis.update(snapshot.twins, snapshot.waypoints, draft);
  const twin = snapshot.twins.find(t => t.uuid === target.value);
  element('pose').textContent = twin ? `Observed local pose: ${twin.position.x.toFixed(1)}, ${twin.position.y.toFixed(1)}, ${twin.position.z.toFixed(1)} m · REST snapshot` : 'No accessible twin.';
}
async function perform(action: () => Promise<void>) {
  if (busy) return;
  busy = true; render();
  try { await action(); } catch (error) { report((error as Error).message, true); }
  finally { busy = false; render(); }
}

async function start() {
  snapshot = await cyberwave.snapshot();
  element('mode').textContent = snapshot.mode === 'fixture' ? 'Fixture preview · no physical commands' :
    `Connected · ${snapshot.executionEnabled ? 'command dispatch enabled' : 'read and draft only'}`;
  element<HTMLButtonElement>('execute').textContent = snapshot.mode === 'fixture' ? 'Preview fixture route' : 'Start navigation';
  for (const twin of snapshot.twins) {
    const option = document.createElement('option'); option.value = twin.uuid; option.textContent = twin.name; target.append(option);
  }
  gis = createGis(element('map'), snapshot.anchor, select, point => select({
    id: crypto.randomUUID(), name: 'Picked map point', position: point,
  }));
  for (const point of snapshot.waypoints) element('saved').append(button(point.name, () => select(point)));
  target.addEventListener('change', () => {
    validatedRevision = null;
    if (frameUrl) URL.revokeObjectURL(frameUrl);
    frameUrl = null; element<HTMLImageElement>('camera').removeAttribute('src');
    element('camera').hidden = true; render();
  });
  element('append').addEventListener('click', () => { if (selected) edit({ type: 'append', point: selected }); });
  element('clear').addEventListener('click', () => edit({ type: 'clear' }));
  element('focus').addEventListener('click', () => gis.focusRoute());
  element('validate').addEventListener('click', () => {
    const errors = validateDraft(draft); validatedRevision = errors.length ? null : draft.revision;
    report(errors.length ? errors.join(' ') : 'Draft shape validated locally. Backend validation occurs at dispatch.', errors.length > 0); render();
  });
  element('execute').addEventListener('click', () => void perform(async () => {
    if (validatedRevision !== draft.revision) throw new Error('Validate the current draft first.');
    const twinUuid = target.value;
    let result;
    try { result = await cyberwave.execute(twinUuid, draft); }
    catch (error) { throw new Error(`${(error as Error).message} Dispatch outcome may be unknown; inspect Cyberwave before retrying.`); }
    active = { twinUuid, actionId: result.action_id };
    element('execution').textContent = `${result.status} · ${result.action_id}`;
    validatedRevision = null; report(result.message || 'Navigation accepted. Physical completion is not yet confirmed.');
  }));
  element('cancel').addEventListener('click', () => void perform(async () => {
    if (!active) return;
    const result = await cyberwave.cancel(active.twinUuid, active.actionId);
    report(`Cancellation request: ${result.status}. Observe the final action status.`);
  }));
  element('frame').addEventListener('click', () => void perform(async () => {
    const blob = await cyberwave.frame(target.value);
    if (frameUrl) URL.revokeObjectURL(frameUrl);
    frameUrl = URL.createObjectURL(blob);
    element<HTMLImageElement>('camera').src = frameUrl; element('camera').hidden = false;
  }));
  render();
  if (snapshot.unsupportedWaypoints) report(`${snapshot.unsupportedWaypoints} relative/invalid waypoints omitted; server frame resolution is required.`);
  let refreshing = false;
  const timer = window.setInterval(async () => {
    if (refreshing || busy) return;
    refreshing = true;
    try {
      snapshot = await cyberwave.snapshot();
      if (active) {
        const result = await cyberwave.status(active.twinUuid, active.actionId);
        element('execution').textContent = `${result.status} · ${active.actionId}`;
      }
      render();
    } catch (error) { report(`Refresh failed; displayed observation may be stale. ${(error as Error).message}`, true); }
    finally { refreshing = false; }
  }, 5000);
  window.addEventListener('pagehide', () => {
    clearInterval(timer); if (frameUrl) URL.revokeObjectURL(frameUrl); gis.destroy();
    // View teardown does not cancel an autonomous backend execution.
  }, { once: true });
}

void start().catch(error => report(error.message, true));
