import './lab.css';
import { cyberwave } from './api.ts';
import { node } from './lab-view.ts';
const frames = new Map<string, string>();
let disposed = false, pending = false;
async function refresh() {
  if (disposed || pending) return; pending = true;
  try {
    const snapshot = await cyberwave.snapshot();
    if (disposed) return;
    node('context').textContent = `${snapshot.mode} · ${snapshot.environmentUuid} · REST snapshot ${new Date().toLocaleTimeString()}`;
    const cards = snapshot.twins.map(twin => {
      const card = document.createElement('section'); card.className = 'card';
      const title = document.createElement('h2'); title.textContent = twin.name;
      const pose = document.createElement('p'); pose.textContent = `${twin.position.x.toFixed(2)}, ${twin.position.y.toFixed(2)}, ${twin.position.z.toFixed(2)} m`;
      const image = document.createElement('img'); image.alt = `${twin.name} latest camera snapshot`; image.hidden = !frames.has(twin.uuid); if (!image.hidden) image.src = frames.get(twin.uuid)!;
      const button = document.createElement('button'); button.textContent = 'Load camera snapshot';
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { const blob = await cyberwave.frame(twin.uuid); if (disposed) return;
          const old = frames.get(twin.uuid); if (old) URL.revokeObjectURL(old);
          const url = URL.createObjectURL(blob); frames.set(twin.uuid, url); image.src = url; image.hidden = false;
        } catch (error) { node('status').textContent = (error as Error).message; }
        finally { button.disabled = false; }
      });
      card.append(title, pose, button, image); return card;
    });
    node('twins').replaceChildren(...cards);
  } catch (error) { node('status').textContent = `Observation may be stale. ${(error as Error).message}`; }
  finally { pending = false; }
}
void refresh(); const timer = window.setInterval(() => void refresh(), 5000);
window.addEventListener('pagehide', () => { disposed = true; clearInterval(timer); for (const url of frames.values()) URL.revokeObjectURL(url); }, { once: true });
