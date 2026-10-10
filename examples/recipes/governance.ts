import { CyberwaveError, type CyberwaveClient, type components } from '../../dist/index.js';

/** Keep each service's result and failure separate; these values are not one spending balance. */
export async function readWorkspaceGovernance(
  client: CyberwaveClient,
  workspaceId: string,
  window: { start_timestamp: string; end_timestamp: string },
  signal?: AbortSignal,
) {
  const start = Date.parse(window.start_timestamp), end = Date.parse(window.end_timestamp);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)
    throw new Error('Provide an increasing ISO date-time window.');
  const query = { start_timestamp: new Date(start).toISOString(), end_timestamp: new Date(end).toISOString() };
  const scope = { path: { uuid: workspaceId } };
  const requireData = async <T>(request: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> => {
    const result = await request;
    if (!result.response.ok) throw new CyberwaveError(result.response.status, result.error);
    return result.data!;
  };
  const workspaceResult = await client.rest.GET('/api/v1/users/workspaces/{uuid}', { params: scope, signal });
  if (!workspaceResult.response.ok) throw new CyberwaveError(workspaceResult.response.status, workspaceResult.error);
  const workspace = workspaceResult.data!.team;
  const [credits, ai, compute, storage, resources, scheduled] = await Promise.allSettled([
    requireData<components['schemas']['OrganizationCreditAccountSchema']>(client.rest.GET('/api/v1/organizations/{uuid}/credits', { params: { path: { uuid: workspace.organization } }, signal })),
    requireData<components['schemas']['AIMetricsSchema']>(client.rest.GET('/api/v1/metrics/ai/{uuid}', { params: { ...scope, query }, signal })),
    requireData<components['schemas']['ComputeMetricsSchema']>(client.rest.GET('/api/v1/metrics/compute/{uuid}', { params: { ...scope, query }, signal })),
    requireData<components['schemas']['StorageMetricsSchema']>(client.rest.GET('/api/v1/metrics/storage/{uuid}', { params: { ...scope, query }, signal })),
    requireData<components['schemas']['ResourceMetricsSchema']>(client.rest.GET('/api/v1/metrics/resources/{uuid}', { params: scope, signal })),
    client.workflows.list({ workspace_uuid: workspaceId, is_template: false, trigger_type: 'schedule', limit: 25, offset: 0 }, { signal }),
  ]);
  signal?.throwIfAborted();
  return { workspace, credits, ai, compute, storage, resources, scheduled };
}
