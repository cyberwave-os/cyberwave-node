import { createContext, useContext, useEffect, useState, useMemo, type ReactNode, type FormEvent } from 'react';
import { DEFAULT_API_URL, type CyberwaveClient, type Environment, type Asset, type EnvironmentSnapshot } from 'cyberwave';
const Context = createContext<CyberwaveClient | null>(null);
export function CyberwaveProvider({ client, children }: { client: CyberwaveClient; children: ReactNode }) { return <Context.Provider value={client}>{children}</Context.Provider>; }
export function useCyberwave() { const client = useContext(Context); if (!client) throw new Error('Wrap Cyberwave components in CyberwaveProvider.'); return client; }
export type { Resource } from "./resource.js";
import { useResource, useResourceKey, type Resource } from "./resource.js";
export function useEnvironment(uuid: string): Resource<EnvironmentSnapshot> {
  const client = useCyberwave();
  return useResource(useMemo(() => (signal: AbortSignal) => client.loadEnvironment(uuid, { signal }), [client, uuid]));
}
export type ConnectionInput = { baseUrl: string; token?: string };
export function ConnectionPanel({ baseUrl = DEFAULT_API_URL, authenticated = false, onConnect, onDisconnect, disconnectLabel = 'Disconnect' }: {
  baseUrl?: string; authenticated?: boolean; onConnect: (input: ConnectionInput) => Promise<void>; onDisconnect?: () => Promise<void>; disconnectLabel?: string;
}) {
  const [url, setUrl] = useState(baseUrl), [token, setToken] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { setUrl(baseUrl); setToken(''); }, [baseUrl]);
  async function connect(event: FormEvent) { event.preventDefault(); setBusy(true); setError('');
    const input = { baseUrl: url, token }; setToken('');
    try { await onConnect(input); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <form className="cw-connection" onSubmit={connect}>
    <div className="cw-connection-title"><span className="cw-dot" /><strong>{authenticated ? 'Authenticated session' : 'Public catalog'}</strong><small>API connection</small></div>
    <label>API origin<input aria-label="API origin" type="url" required value={url} onChange={e => { setUrl(e.target.value); setToken(''); }} list="cw-api-origins" /></label>
    <datalist id="cw-api-origins"><option value={DEFAULT_API_URL} /><option value="http://localhost:8000" /></datalist>
    <label>API token <small>optional for public assets</small><input aria-label="API token" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="Paste a token for this origin" /></label>
    <button className="cw-button cw-primary" disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</button>
    {onDisconnect && <button type="button" className="cw-button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await onDisconnect(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>{disconnectLabel}</button>}
    {error && <p role="alert" className="cw-error">{error}</p>}
  </form>;
}
function Status({ loading, error, empty }: { loading: boolean; error?: Error; empty: boolean }) {
  if (loading) return <p className="cw-status" role="status">Loading from Cyberwave…</p>;
  if (error) return <p className="cw-error" role="alert">{error.message}</p>;
  return empty ? <p className="cw-status">No results. Try a different search or workspace.</p> : null;
}
function Thumbnail({ url, name }: { url?: string | null; name: string }) {
  const [failed, setFailed] = useState(false); useEffect(() => setFailed(false), [url]);
  return url && !failed ? <img className="cw-thumbnail" src={url} alt="" loading="lazy" onError={() => setFailed(true)} /> : <div className="cw-thumbnail cw-placeholder" aria-hidden="true">{name.slice(0, 1)}</div>;
}
function Browser<T extends Environment | Asset>({ kind, onSelect, selectedId, resolveResource = value => value }: { kind: 'environments' | 'assets'; onSelect: (value: T) => void; selectedId?: string; resolveResource?: (value: string) => string }) {
  const client = useCyberwave(); const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [offset, setOffset] = useState(0);
  const load = useMemo(() => (signal: AbortSignal) => client[kind].list({ search: query, limit: 12, offset }, { signal }) as Promise<T[]>, [client, kind, query, offset]);
  const state = useResource(load);
  return <div className="cw-browser">
    <form className="cw-search" onSubmit={e => { e.preventDefault(); setOffset(0); setQuery(search); }}><input aria-label={`Search ${kind}`} placeholder={`Search ${kind}…`} value={search} onChange={e => setSearch(e.target.value)} /><button className="cw-button">Search</button></form>
    <Status {...state} empty={!state.data?.length} />
    <div className="cw-resource-list">{!state.loading && state.data?.map(item => <button type="button" className={`cw-resource ${selectedId === item.uuid ? 'cw-selected' : ''}`} key={item.uuid} onClick={() => onSelect(item)} aria-pressed={selectedId === item.uuid}>
      <Thumbnail url={item.thumbnail ? resolveResource(new URL(item.thumbnail, client.baseUrl).href) : undefined} name={item.name} />
      <span><strong>{item.name}</strong><small>{'registry_id' in item ? item.registry_id || 'Catalog asset' : `${item.visibility || 'Private'} environment`}</small></span><span className="cw-arrow" aria-hidden="true">↗</span>
    </button>)}</div>
    <div className="cw-pagination"><button className="cw-button" disabled={offset === 0 || state.loading} onClick={() => setOffset(Math.max(0, offset - 12))}>Previous</button><span>Page {offset / 12 + 1}</span><button className="cw-button" disabled={state.loading || (state.data?.length ?? 0) < 12} onClick={() => setOffset(offset + 12)}>Next</button></div>
  </div>;
}
export function EnvironmentBrowser(props: { onSelect: (environment: Environment) => void; selectedId?: string; resolveResource?: (url: string) => string }) {
  const key = useResourceKey(useCyberwave());
  return <Browser<Environment> key={key} kind="environments" {...props} />;
}
export function AssetBrowser(props: { onSelect: (asset: Asset) => void; selectedId?: string; resolveResource?: (url: string) => string }) {
  const key = useResourceKey(useCyberwave());
  return <Browser<Asset> key={key} kind="assets" {...props} />;
}
export function EnvironmentSummary({ snapshot }: { snapshot: EnvironmentSnapshot }) {
  return <section className="cw-summary"><span className="cw-eyebrow">Environment loaded</span><h2>{snapshot.environment.name}</h2><p>{snapshot.environment.description || 'Ready for your custom application.'}</p>
    <div className="cw-metrics"><span><strong>{snapshot.twins.length}</strong> twins</span><span><strong>{snapshot.objects.filter(x => x.model).length}</strong> renderable</span></div>
    {snapshot.warnings.length > 0 && <details><summary>{snapshot.warnings.length} loading notes</summary><ul>{snapshot.warnings.map((note, i) => <li key={i}>{note}</li>)}</ul></details>}
  </section>;
}

export function RecordingBrowser({ environmentUuid, onSelect, selectedId }: { environmentUuid: string; onSelect: (recording: import('cyberwave').Recording) => void; selectedId?: string }) {
  const key = useResourceKey(useCyberwave(), environmentUuid);
  return <RecordingPage key={key} environmentUuid={environmentUuid} onSelect={onSelect} selectedId={selectedId} />;
}
function RecordingPage({ environmentUuid, onSelect, selectedId }: { environmentUuid: string; onSelect: (recording: import('cyberwave').Recording) => void; selectedId?: string }) {
  const client = useCyberwave(), [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const cursor = cursors[cursors.length - 1];
  const state = useResource(useMemo(() => (signal: AbortSignal) => client.recordings.list(environmentUuid, { limit: 12, cursor }, { signal }), [client, environmentUuid, cursor]));
  return <section className="cw-browser"><Status {...state} empty={!state.data?.items.length} />
    <div className="cw-resource-list">{state.data?.items.map(item => <button className={`cw-resource ${item.uuid === selectedId ? 'cw-selected' : ''}`} key={item.uuid} onClick={() => onSelect(item)} aria-pressed={item.uuid === selectedId}><span><strong>{String(item.metadata.session_name_defined_by_user || item.metadata.recording_type || 'Recording')}</strong><small>{item.uuid}</small><small>{String(item.metadata.source_type || item.metadata.context || 'Source not specified')} · {String(item.playback_readiness?.state || 'Readiness unknown')}</small></span></button>)}</div>
    <div className="cw-pagination"><button className="cw-button" disabled={state.loading || cursors.length === 1} onClick={() => setCursors(cursors.slice(0, -1))}>Previous</button><span>Page {cursors.length}</span><button className="cw-button" disabled={state.loading || !state.data?.has_more || !state.data.next_cursor} onClick={() => setCursors([...cursors, state.data?.next_cursor || undefined])}>Next</button></div>
  </section>;
}
export function useRecordingPlayback(environmentUuid: string, recordingUuid: string, refreshKey = 0) {
  const client = useCyberwave();
  return useResource(useMemo(() => (signal: AbortSignal) => client.recordings.playback(environmentUuid, recordingUuid, { signal }), [client, environmentUuid, recordingUuid, refreshKey]));
}
/** Native media playback. Call onTime for a media-relative cursor; precise sensor
 * synchronization belongs in an application's clock/SEI adapter. */
export function RecordingVideo({ src, onTime, onError }: { src: string; onTime?: (seconds: number) => void; onError?: () => void }) {
  return <video key={src} className="cw-recording-video" src={src} controls playsInline preload="metadata" onTimeUpdate={event => onTime?.(event.currentTarget.currentTime)} onError={onError} />;
}

export { WorkflowCatalog } from './workflow-catalog.js';
export { WorkflowPlanner } from './workflow-planner.js';
export { WorkflowMonitor, workflowError } from './workflow-monitor.js';
export { InspectionVerificationPanel } from './inspection-verification.js';

export { SensorTelemetryPanel, useSensorTelemetry } from './sensor-telemetry.js';
