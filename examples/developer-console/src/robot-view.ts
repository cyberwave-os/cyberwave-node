/** Same renderer as the environment explorer; poses come from an independent controller/observer. */
import { createEnvironmentViewer } from '@cyberwave/environment-3d';
import { assetModel, type SceneObject } from 'cyberwave';
import { connectedClient, mediaUrl, restoreConnection } from './connection.ts';
import type { Anchor, Position } from './domain.ts';
export function createRobotView(container: HTMLElement, _anchor: Anchor) {
  const status = document.createElement('p'); status.className = 'muted'; container.after(status);
  const viewer = createEnvironmentViewer(container, { resolveResource: mediaUrl, onStatus: text => { status.textContent = text; } });
  let disposed = false, object: SceneObject | undefined;
  let latest = { position: { x: 0, y: 0, z: .42 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
  void (async () => {
    const client = connectedClient(await restoreConnection());
    const [asset] = await client.assets.list({ registry_id: 'unitree/go2', limit: 1 });
    if (!asset) throw new Error('Unitree Go2 is not present in this catalog. Select another API in Asset studio.');
    const detail = await client.assets.get(asset.uuid); if (disposed) return;
    object = { id: asset.uuid, name: asset.name, model: assetModel(detail, client.baseUrl), ...latest, scale: { x: 1, y: 1, z: 1 }, joints: {} };
    await viewer.setObjects([object]); if (!disposed) { viewer.updatePose(object.id, latest); viewer.fit(1.8); }
  })().catch(error => { if (!disposed) status.textContent = error.message; });
  return {
    fit() { viewer.fit(1.8); },
    update(position: Position, heading: number, source: 'simulation' | 'live') {
      latest = { position: { ...position, z: position.z + (source === 'simulation' ? .42 : 0) }, rotation: { x: 0, y: 0, z: Math.sin(heading / 2), w: Math.cos(heading / 2) } };
      if (object) viewer.updatePose(object.id, latest);
    },
    destroy() { disposed = true; viewer.destroy(); status.remove(); },
  };
}
