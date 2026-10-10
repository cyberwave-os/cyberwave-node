import createClient from 'openapi-fetch';
import { waitForModelExecution, type ModelExecutionOptions } from './mlmodels.js';
export type { MLModelExecution, ModelExecutionOptions } from './mlmodels.js';
import type { paths as ProductionPaths, components } from './generated/schema.js';
import type { paths as ExtensionPaths, components as ExtensionComponents } from './generated/extensions.js';
export type { components } from './generated/schema.js';
export type paths = Omit<ProductionPaths, keyof ExtensionPaths> & ExtensionPaths;
export type HumanAction = ExtensionComponents['schemas']['HumanActionSchema'];
export type HumanActionResponse = ExtensionComponents['schemas']['HumanActionResponse'];
export type DatasetSample = ExtensionComponents['schemas']['DatasetSampleSchema'];
export type SampleAnnotation = ExtensionComponents['schemas']['SampleAnnotation'];
export type WorkflowInputContract = ExtensionComponents['schemas']['WorkflowInputContractSchema'];
export type Asset = components['schemas']['AssetSchema'];
export type Environment = components['schemas']['EnvironmentSchema'];
export type Twin = components['schemas']['TwinSchema'];
/** Preview contract: requires a backend with the inspection extension deployed. */
export type InspectionCampaign = ExtensionComponents['schemas']['InspectionCampaignDetailSchema'];
export type InspectionManifest = ExtensionComponents['schemas']['ImportInspectionCampaignInput'];
export type InspectionReviewInput = ExtensionComponents['schemas']['CreateInspectionReviewInput'];
export type Mission = components['schemas']['MissionSchema'];
export type MissionExecution = components['schemas']['MissionExecutionSchema'];
export type Workflow = components['schemas']['WorkflowSchema'];
export type WorkflowNode = components['schemas']['WorkflowNodeSchema'];
export { workflowEditableFields, workflowNodePatch, workflowSchedules, workflowFieldText, workflowInputUpdates } from './workflows.js';
export type { WorkflowEditableField } from './workflows.js';
export type WorkflowExecution = components['schemas']['WorkflowExecutionSchema'];
export type WorkflowQuery = NonNullable<paths['/api/v1/workflows']['get']['parameters']['query']>;
export type Recording = components['schemas']['RecordingListItem'];
export type RecordingQuery = NonNullable<paths['/api/v1/environments/{uuid}/recordings']['get']['parameters']['query']>;
export type RecordingPlayback =
  | { status: 'ready'; sources: components['schemas']['RecordingSourcesSchema'] }
  | { status: 'materializing'; detail: string; retryAfterSeconds?: number | null; readiness: Record<string, unknown> };
export { recordingWindow, recordingVideos, mediaSecondsToTimestampUs } from './recordings.js';
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
    /** Additive development endpoint. Older backends return 404; per-twin discovery remains available. */
    missions: (uuid: string, query: {limit?: number; offset?: number} = {}, opts: ReadOptions = {}) => data(rest.GET('/api/v1/environments/{uuid}/missions', { params: { path: { uuid }, query }, ...opts })),
  };
  const assets = {
    list: (query: { search?: string; registry_id?: string; limit?: number; offset?: number; public_only?: boolean } = {}, opts: ReadOptions = {}) =>
      data(rest.GET('/api/v1/assets', { params: { query }, ...opts })),
    get: (uuid: string, opts: ReadOptions = {}) => data(rest.GET('/api/v1/assets/{uuid}', { params: { path: { uuid } }, ...opts })),
  };
  const modelExecution = (execution_uuid: string, opts: ReadOptions = {}) => data(rest.GET('/api/v1/mlmodels/executions/{execution_uuid}', { params: { path: { execution_uuid } }, ...opts }));
  /** Existing model runs and durable execution records; submission is never retried. */
  const mlmodels = {
    get: (uuid: string, opts: ReadOptions = {}) => data(rest.GET('/api/v1/mlmodels/{uuid}', { params: { path: { uuid } }, ...opts })),
    run: (uuid: string, body: components['schemas']['MLModelRunSchema'], opts: ReadOptions = {}) => data(rest.POST('/api/v1/mlmodels/{uuid}/run', { params: { path: { uuid } }, body, ...opts })),
    execution: modelExecution,
    waitForExecution: (uuid: string, opts: ModelExecutionOptions = {}) => waitForModelExecution(modelExecution, uuid, opts),
  };
  const missions = {
    forWorkspace: (workspace_uuid: string, query: {environment_uuid?:string;twin_uuid?:string;limit?:number;offset?:number} = {}, opts: ReadOptions = {}) => data(rest.GET('/api/v1/workspaces/{workspace_uuid}/missions', {params:{path:{workspace_uuid},query},...opts})),
    list: (uuid: string, opts: ReadOptions = {}) => data(rest.GET('/api/v1/twins/{uuid}/missions', { params: { path: { uuid } }, ...opts })),
    get: (twin_uuid: string, uuid: string, opts: ReadOptions = {}) => data(rest.GET('/api/v1/twins/{twin_uuid}/missions/{uuid}', { params: { path: { twin_uuid, uuid } }, ...opts })),
    executions: (twin_uuid: string, uuid: string, opts: ReadOptions = {}) => data(rest.GET('/api/v1/twins/{twin_uuid}/missions/{uuid}/executions', { params: { path: { twin_uuid, uuid } }, ...opts })),
  };
  /** Preview media collections reuse Dataset and Attachment; no separate evidence store. */
  const datasets = {
    get: (uuid: string, opts: ReadOptions = {}) => data(rest.GET('/api/v1/datasets/{uuid}', { params: { path: { uuid } }, ...opts })),
    createCollection: (body: ExtensionComponents['schemas']['SampleCollectionInput'], opts: ReadOptions = {}) => data(rest.POST('/api/v1/datasets/collections', { body, ...opts })),
    samples: (uuid: string, query: NonNullable<paths['/api/v1/datasets/{uuid}/samples']['get']['parameters']['query']> = {}, opts: ReadOptions = {}) => data(rest.GET('/api/v1/datasets/{uuid}/samples', { params: { path: { uuid }, query }, ...opts })),
    appendSample: (uuid: string, body: ExtensionComponents['schemas']['SampleAppendInput'], opts: ReadOptions = {}) => data(rest.POST('/api/v1/datasets/{uuid}/samples', { params: { path: { uuid } }, body, ...opts })),
    reviewSample: (uuid: string, sample_uuid: string, body: ExtensionComponents['schemas']['SampleReviewInput'], opts: ReadOptions = {}) => data(rest.POST('/api/v1/datasets/{uuid}/samples/{sample_uuid}/review', { params: { path: { uuid, sample_uuid } }, body, ...opts })),
  };
  /** Assignee-scoped interactions with paused workflow nodes, owned by the backend. */
  const humanActions = {
    list: (query: NonNullable<paths['/api/v1/workflow-actions']['get']['parameters']['query']> = {}, opts: ReadOptions = {}) => data(rest.GET('/api/v1/workflow-actions', { params: { query }, ...opts })),
    get: (uuid: string, opts: ReadOptions = {}) => data(rest.GET('/api/v1/workflow-actions/{uuid}', { params: { path: { uuid } }, ...opts })),
    respond: (uuid: string, body: HumanActionResponse, opts: ReadOptions = {}) => data(rest.POST('/api/v1/workflow-actions/{uuid}/respond', { params: { path: { uuid } }, body, ...opts })),
  };
  /** Existing workflow engine; preview pagination requires the updated backend. */
  const workflows = {
    inputContract: (uuid: string, opts: ReadOptions = {}) => data(rest.GET('/api/v1/workflows/{uuid}/input-contract', {params:{path:{uuid}},...opts})),
    clone: (uuid: string, body: components['schemas']['WorkflowCloneSchema'], opts: ReadOptions = {}) => data(rest.POST('/api/v1/workflows/{uuid}/clone', {params:{path:{uuid}},body,...opts})),
    update: (uuid: string, body: components['schemas']['WorkflowUpdateSchema'], opts: ReadOptions = {}) => data(rest.PUT('/api/v1/workflows/{uuid}', {params:{path:{uuid}},body,...opts})),
    updateNode: (uuid: string, node_uuid: string, body: components['schemas']['WorkflowNodeUpdateSchema'], opts: ReadOptions = {}) => data(rest.PUT('/api/v1/workflows/{uuid}/nodes/{node_uuid}', {params:{path:{uuid,node_uuid}},body,...opts})),
    activate: (uuid: string, opts: ReadOptions = {}) => data(rest.POST('/api/v1/workflows/{uuid}/activate', {params:{path:{uuid}},...opts})),
    deactivate: (uuid: string, opts: ReadOptions = {}) => data(rest.POST('/api/v1/workflows/{uuid}/deactivate', {params:{path:{uuid}},...opts})),
    execute: (uuid: string, trigger_data: Record<string, unknown> = {}, opts: ReadOptions = {}) => data(rest.POST('/api/v1/workflows/{uuid}/execute', {params:{path:{uuid}},body:{trigger_data},...opts})),
    execution: (uuid: string, execution_uuid: string, opts: ReadOptions = {}) => data(rest.GET('/api/v1/workflows/{uuid}/executions/{execution_uuid}', {params:{path:{uuid,execution_uuid}},...opts})),
    cancel: (execution_uuid: string, opts: ReadOptions = {}) => data(rest.POST('/api/v1/workflows/executions/{execution_uuid}/cancel', {params:{path:{execution_uuid}},...opts})),
    templates: (opts: ReadOptions = {}) => data(rest.GET('/api/v1/workflows/templates', opts)),
    list: (query: WorkflowQuery = {}, opts: ReadOptions = {}) => data(rest.GET('/api/v1/workflows', { params: { query }, ...opts })),
    get: (uuid: string, opts: ReadOptions = {}) => data(rest.GET('/api/v1/workflows/{uuid}', { params: { path: { uuid } }, ...opts })),
    executions: (uuid: string, opts: ReadOptions & {limit?: number; offset?: number} = {}) => { const {limit, offset, ...read} = opts; return data(rest.GET('/api/v1/workflows/{uuid}/executions', { params: { path: { uuid }, query: {limit, offset} }, ...read })); },
  };
  const recordings = {
    list: (uuid: string, query: RecordingQuery = {}, opts: ReadOptions = {}) => data(rest.GET('/api/v1/environments/{uuid}/recordings', { params: { path: { uuid }, query }, ...opts })),
    async playback(uuid: string, recording_uuid: string, opts: ReadOptions = {}): Promise<RecordingPlayback> {
      const result = await rest.GET('/api/v1/environments/{uuid}/recordings/{recording_uuid}/data', { params: { path: { uuid, recording_uuid } }, ...opts });
      if (!result.response.ok) throw new CyberwaveError(result.response.status, result.error);
      const body = result.data!;
      if ('items' in body) return { status: 'ready', sources: body.items };
      return { status: 'materializing', detail: body.detail, retryAfterSeconds: body.retry_after_seconds, readiness: body.playback_readiness };
    },
  };
  /** Additive development API. Import and review persist metadata; neither commands a device. */
  const inspections = {
    list: (uuid: string, query: {limit?: number; offset?: number} = {}, opts: ReadOptions = {}) => data(rest.GET('/api/v1/environments/{uuid}/inspection-campaigns', {params:{path:{uuid},query},...opts})),
    get: (uuid: string, campaign_uuid: string, opts: ReadOptions = {}) => data(rest.GET('/api/v1/environments/{uuid}/inspection-campaigns/{campaign_uuid}', {params:{path:{uuid,campaign_uuid}},...opts})),
    importCampaign: (uuid: string, body: InspectionManifest, opts: ReadOptions = {}) => data(rest.POST('/api/v1/environments/{uuid}/inspection-campaigns', {params:{path:{uuid}},body,...opts})),
    history: (uuid: string, defect_uuid: string, query: {limit?:number;offset?:number} = {}, opts: ReadOptions = {}) => data(rest.GET('/api/v1/environments/{uuid}/inspection-defects/{defect_uuid}/observations', {params:{path:{uuid,defect_uuid},query},...opts})),
    review: (uuid: string, observation_uuid: string, body: InspectionReviewInput, opts: ReadOptions = {}) => data(rest.POST('/api/v1/environments/{uuid}/inspection-observations/{observation_uuid}/reviews', {params:{path:{uuid,observation_uuid}},body,...opts})),
  };
  async function loadEnvironment(uuid: string, opts: ReadOptions = {}): Promise<EnvironmentSnapshot> {
    const [environment, twins] = await Promise.all([environments.get(uuid, opts), environments.twins(uuid, opts)]);
    const warnings: string[] = [], objects: SceneObject[] = [];
    const assetCache = new Map<string, Promise<Asset>>();
    // Bound concurrent requests and deduplicate repeated assets within this snapshot.
    for (let start = 0; start < twins.length; start += 6) {
      const batch = await Promise.all(twins.slice(start, start + 6).map(async twin => {
        if (twin.attach_to_twin_uuid) { warnings.push(`${twin.name}: attached frame requires a resolved world pose; omitted.`); return; }
        let model: Model | undefined;
        try { model = assetModel(twin, baseUrl); }
        catch { warnings.push(`${twin.name}: invalid model URL; trying its catalog asset.`); }
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
  return { baseUrl, rest, environments, assets, missions, workflows, recordings, inspections, datasets, humanActions, mlmodels, loadEnvironment };
}
export type CyberwaveClient = ReturnType<typeof createCyberwave>;

export type StructuredActionCatalog = import('./generated/extensions.js').components['schemas']['StructuredActionCatalogSchema'];
export type StructuredImageAction = StructuredActionCatalog['actions'][number];
export type ImageAnnotationContract = NonNullable<StructuredImageAction['image_annotation']>;
