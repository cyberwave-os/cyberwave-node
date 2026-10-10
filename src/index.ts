import createClient from 'openapi-fetch';
import type { paths, components } from './generated/schema.js';
export type { paths, components } from './generated/schema.js';
export type Asset = components['schemas']['AssetSchema'];
export type Environment = components['schemas']['EnvironmentSchema'];
export type Twin = components['schemas']['TwinSchema'];
export const DEFAULT_API_URL = 'https://api.cyberwave.com';

export function normalizeApiUrl(value = DEFAULT_API_URL): string {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error('Use an HTTPS API origin, or HTTP on localhost, without credentials, a path, or a query.');
  return url.origin;
}
export class CyberwaveError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(status === 401 ? 'Authentication required. Connect with a Cyberwave API token.' : status === 403 ? 'This account cannot access this resource.' : `Cyberwave request failed (${status}).`);
    this.name = 'CyberwaveError';
  }
}
export type ClientOptions = {
  baseUrl?: string;
  /** Called per request. The application owns sign-in, token refresh and sign-out. */
  getToken?: () => string | undefined | Promise<string | undefined>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};
export type ReadOptions = { signal?: AbortSignal };
export type Model = { kind: 'urdf' | 'glb'; url: string; packageRoots?: Record<string, string> };
export type SceneObject = {
  id: string; name: string; model?: Model;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  scale: { x: number; y: number; z: number };
  joints: Record<string, number>;
};
export type EnvironmentSnapshot = { environment: Environment; twins: Twin[]; objects: SceneObject[]; warnings: string[] };

/** Model downloads deliberately do not use the authenticated API transport. */
export function assetModel(asset: Pick<Asset, 'urdf_file' | 'glb_file'>, baseUrl: string): Model | undefined {
  const kind = asset.urdf_file ? 'urdf' : asset.glb_file ? 'glb' : undefined;
  const value = kind === 'urdf' ? asset.urdf_file : asset.glb_file;
  if (!kind || !value) return;
  const url = new URL(value, baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsupported model URL');
  return { kind, url: url.href };
}
export function createCyberwave(options: ClientOptions = {}) {
  const baseUrl = normalizeApiUrl(options.baseUrl);
  const transport = options.fetch ?? globalThis.fetch;
  const rest = createClient<paths>({ baseUrl, fetch: async (request) => {
    if (new URL(request.url).origin !== baseUrl) throw new Error('API credentials cannot cross origins.');
    const headers = new Headers(request.headers);
    headers.delete('Authorization');
    const token = await options.getToken?.();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return transport(new Request(request, { headers, credentials: 'omit', redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(options.timeoutMs ?? 20000)]) }));
  }});
  async function data<T>(request: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
    const result = await request;
    if (!result.response.ok) throw new CyberwaveError(result.response.status, result.error);
    return result.data as T;
  }
  const environments = {
    list: (query: { search?: string; workspace_uuid?: string; limit?: number; offset?: number } = {}, opts: ReadOptions = {}) =>
      data(rest.GET('/api/v1/environments', { params: { query }, ...opts })),
    get: (uuid: string, opts: ReadOptions = {}) => data(rest.GET('/api/v1/environments/{uuid}', { params: { path: { uuid } }, ...opts })),
    twins: (uuid: string, opts: ReadOptions = {}) => data(rest.GET('/api/v1/environments/{uuid}/twins', { params: { path: { uuid } }, ...opts })),
    waypoints: (uuid: string, opts: ReadOptions = {}) => data(rest.GET('/api/v1/environments/{uuid}/waypoints', { params: { path: { uuid } }, ...opts })),
  };
  const assets = {
    list: (query: { search?: string; registry_id?: string; limit?: number; offset?: number; public_only?: boolean } = {}, opts: ReadOptions = {}) =>
      data(rest.GET('/api/v1/assets', { params: { query }, ...opts })),
    get: (uuid: string, opts: ReadOptions = {}) => data(rest.GET('/api/v1/assets/{uuid}', { params: { path: { uuid } }, ...opts })),
  };
  async function loadEnvironment(uuid: string, opts: ReadOptions = {}): Promise<EnvironmentSnapshot> {
    const [environment, twins] = await Promise.all([environments.get(uuid, opts), environments.twins(uuid, opts)]);
    const warnings: string[] = [], objects: SceneObject[] = [];
    const assetCache = new Map<string, Promise<Asset>>();
    // Bound concurrent requests and deduplicate repeated assets within this snapshot.
    for (let start = 0; start < twins.length; start += 6) {
      const batch = await Promise.all(twins.slice(start, start + 6).map(async twin => {
        if (twin.attach_to_twin_uuid) { warnings.push(`${twin.name}: attached frame requires a resolved world pose; omitted.`); return; }
        let model = assetModel(twin, baseUrl);
        if (!model && twin.asset_uuid) {
          try {
            if (!assetCache.has(twin.asset_uuid)) assetCache.set(twin.asset_uuid, assets.get(twin.asset_uuid, opts));
            model = assetModel((await assetCache.get(twin.asset_uuid))!, baseUrl);
          } catch (error) { if (opts.signal?.aborted) throw error; warnings.push(`${twin.name}: asset unavailable.`); }
        }
        if (!model) warnings.push(`${twin.name}: no GLB or URDF representation.`);
        const joints: Record<string, number> = {};
        for (const [key, value] of Object.entries(twin.joint_states || {})) {
          const angle = typeof value === 'number' ? value : typeof value === 'object' && value !== null ? (value as { position?: unknown }).position : undefined;
          if (typeof angle === 'number' && Number.isFinite(angle)) joints[key] = angle;
        }
        return { id: twin.uuid, name: twin.name, model,
          position: { x: twin.position_x ?? 0, y: twin.position_y ?? 0, z: twin.position_z ?? 0 },
          rotation: { x: twin.rotation_x ?? 0, y: twin.rotation_y ?? 0, z: twin.rotation_z ?? 0, w: twin.rotation_w ?? 1 },
          scale: { x: twin.scale_x ?? 1, y: twin.scale_y ?? 1, z: twin.scale_z ?? 1 }, joints } satisfies SceneObject;
      }));
      for (const object of batch) if (object) objects.push(object);
    }
    return { environment, twins, objects, warnings };
  }
  return { baseUrl, rest, environments, assets, loadEnvironment };
}
export type CyberwaveClient = ReturnType<typeof createCyberwave>;
