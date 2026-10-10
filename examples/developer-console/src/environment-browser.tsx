import { useEffect, useRef, useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { assetModel, DEFAULT_API_URL, type Asset, type Environment, type SceneObject, type EnvironmentSnapshot } from 'cyberwave';
import { CyberwaveProvider, ConnectionPanel, EnvironmentBrowser, AssetBrowser, EnvironmentSummary } from '@cyberwave/react';
import { createEnvironmentViewer } from '@cyberwave/environment-3d';
import { connect, connectedClient, disconnect, mediaUrl, restoreConnection, type Connection } from './connection.ts';
import '@cyberwave/react/styles.css';
import './environment-browser.css';
const catalog = location.pathname.includes('asset-catalog');
function App() {
  const [connection, setConnection] = useState<Connection>(), [error, setError] = useState(''), [selected, setSelected] = useState<Environment | Asset>(), [snapshot, setSnapshot] = useState<EnvironmentSnapshot>();
  const [objects, setObjects] = useState<SceneObject[]>([]), [status, setStatus] = useState('Choose an environment or asset to load its real models.'), [preview, setPreview] = useState(false), [picked, setPicked] = useState(''), [ready, setReady] = useState(false);
  const container = useRef<HTMLDivElement>(null), viewer = useRef<ReturnType<typeof createEnvironmentViewer>>(null);
  const client = useMemo(() => connection ? connectedClient(connection) : undefined, [connection]);
  useEffect(() => { let active = true; restoreConnection().then(value => { if (active) setConnection(value); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  useEffect(() => { if (!container.current) return; const view = createEnvironmentViewer(container.current, { resolveResource: mediaUrl, onStatus: setStatus, onSelect: setPicked, onLoad: result => setReady(result.loaded > 0) }); viewer.current = view; return () => view.destroy(); }, []);
  useEffect(() => { setReady(false); void viewer.current?.setObjects(objects); }, [objects]);
  useEffect(() => {
    if (!client || !selected) return;
    const abort = new AbortController(); setError(''); setPreview(false); setSnapshot(undefined); setObjects([]); setPicked(''); setStatus(`Loading ${selected.name}…`);
    const load = catalog ? client.assets.get(selected.uuid, { signal: abort.signal }).then(asset => {
      const model = assetModel(asset, client.baseUrl);
      if (!model) throw new Error('This asset has no URDF or GLB model available.');
      const joints: Record<string, number> = {};
      const schema = asset.universal_schema as { joints?: { name?: string; home_position?: number }[] } | null;
      for (const joint of schema?.joints ?? []) if (joint.name && typeof joint.home_position === 'number') joints[joint.name] = joint.home_position;
      return { objects: [{ id: asset.uuid, name: asset.name, model, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, joints }] };
    }) : client.loadEnvironment(selected.uuid, { signal: abort.signal });
    load.then(value => { if (abort.signal.aborted) return; setObjects(value.objects); if ('environment' in value) setSnapshot(value); }).catch(e => { if (!abort.signal.aborted) { setError(e.message); setStatus('Loading failed'); } });
    return () => abort.abort();
  }, [client, selected]);
  useEffect(() => {
    if (!preview || !objects[0]) return;
    let frame: number; const start = performance.now(), object = objects[0];
    function tick(now: number) { const angle = (now - start) / 3500; viewer.current?.updatePose(object.id, { position: { x: Math.sin(angle) * .8, y: (1 - Math.cos(angle)) * .8, z: object.position.z }, rotation: { x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) } }); frame = requestAnimationFrame(tick); }
    frame = requestAnimationFrame(tick); return () => { cancelAnimationFrame(frame); viewer.current?.updatePose(object.id, object); };
  }, [preview, objects]);
  async function changeConnection(input: { baseUrl: string; token?: string }) {
    // Invalidate scene and selections before changing the credential destination.
    setSelected(undefined); setSnapshot(undefined); setObjects([]); setPreview(false); setConnection(undefined);
    setConnection(await connect(input.baseUrl, input.token)); setError('');
  }
  return <main className="studio">
    <section className="studio-heading"><div><span className="studio-kicker">CYBERWAVE / DEVELOPER SDK</span><h1>{catalog ? 'Real assets. Your experience.' : 'Your world. Your interface.'}</h1><p>{catalog ? 'Explore production catalog models and compose your own robot experience.' : 'Load a Cyberwave environment into an independent, embeddable 3D view.'}</p></div><a href={catalog ? '/environments.html' : '/asset-catalog.html'} className="studio-link">{catalog ? 'Browse environments' : 'Explore public assets'} ↗</a></section>
    <ConnectionPanel baseUrl={connection?.baseUrl ?? DEFAULT_API_URL} authenticated={connection?.authenticated} onConnect={changeConnection} onDisconnect={async () => { setSelected(undefined); setSnapshot(undefined); setObjects([]); setPreview(false); setConnection(undefined); await disconnect(); setStatus('Disconnected. Connect to browse again.'); }} />
    <p className="studio-session">{connection ? `${connection.baseUrl} · ${connection.authenticated ? 'Token held in gateway memory for this session' : 'Anonymous catalog access'}` : 'Connect to start'} · Changing origin clears the scene and credentials. Environment access requires authentication.</p>
    {error && <p role="alert" className="cw-error">{error}</p>}
    <div className="studio-workspace"><aside className="studio-browser"><div className="studio-section-title"><h2>{catalog ? 'Asset catalog' : 'Environments'}</h2><span>{catalog ? 'URDF / GLB' : 'YOUR WORKSPACE'}</span></div>
      {client && <CyberwaveProvider key={connection?.baseUrl + String(connection?.authenticated)} client={client}>{catalog ? <AssetBrowser onSelect={setSelected} selectedId={selected?.uuid} resolveResource={mediaUrl} /> : <EnvironmentBrowser onSelect={setSelected} selectedId={selected?.uuid} resolveResource={mediaUrl} />}</CyberwaveProvider>}
      {!client && <p className="studio-muted">Choose an API origin and connect above.</p>}
    </aside><section className="studio-viewport"><div className="studio-viewport-toolbar"><span><i /> {preview ? 'KINEMATIC PREVIEW' : '3D VIEW'} <small>{selected?.name || 'No selection'}</small></span><button className="cw-button" onClick={() => viewer.current?.fit()}>Fit scene</button></div><div className="studio-canvas" ref={container} />
      {!selected && <div className="studio-empty"><span>↖</span><h2>{catalog ? 'Pick a real robot' : 'Open an environment'}</h2><p>{catalog ? 'URDF meshes, materials and joints come from the Cyberwave catalog.' : 'Your twins and asset models appear here in their stored poses.'}</p></div>}
      <div className="studio-viewport-footer"><span role="status">{status}</span><span>Orbit · drag &nbsp; / &nbsp; Zoom · scroll &nbsp; / &nbsp; Select · double-click</span></div>
    </section><aside className="studio-inspector"><span className="cw-eyebrow">Integration details</span>{snapshot ? <EnvironmentSummary snapshot={snapshot} /> : <><h2>{selected?.name || 'Build on Cyberwave'}</h2><p>{selected?.description || 'Choose real data from production or your local API. Bring your own layout, renderer and controls.'}</p></>}
      {catalog && selected && <button className="cw-button cw-primary" disabled={!ready} onClick={() => setPreview(!preview)}>{preview ? 'Stop preview' : 'Preview motion'}</button>}
      {catalog && <p className="studio-muted">Motion preview moves the rendered model only. It does not run physics or command a robot.</p>}
      {objects.length > 0 && <div className="studio-object-list"><h3>Scene objects · {objects.length}</h3>{objects.map(object => <button key={object.id} className={picked === object.id ? 'selected' : ''} onClick={() => setPicked(object.id)}>{object.name}<small>{object.model?.kind.toUpperCase() || 'No model'}</small></button>)}</div>}
      <details className="studio-code"><summary>Use in your application</summary><pre>{catalog ? "const asset = await client.assets.get(id);\nconst model = assetModel(asset, client.baseUrl);\nviewer.setObjects([{ ...pose, model }]);" : "const scene = await client.loadEnvironment(id);\nviewer.setObjects(scene.objects);\n\n// Feed observed or simulated poses independently\nviewer.updatePose(twinId, observedPose);"}</pre></details>
    </aside></div>
    <footer className="studio-footer">cyberwave <span>→</span> @cyberwave/react <span>+</span> @cyberwave/environment-3d <a href="https://github.com/cyberwave-os/cyberwave-node">View source ↗</a></footer>
  </main>;
}
createRoot(document.getElementById('app')!).render(<App />);
