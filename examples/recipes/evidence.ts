import { CyberwaveError, type CyberwaveClient, type components } from '../../dist/index.js';

/** Select a robot-and-camera recording window; this is not an image upload API. */
export async function selectEpisode(
  client: CyberwaveClient,
  input: Pick<components['schemas']['EpisodeCreateSchema'], 'task_name' | 'twins' | 'started_at' | 'finished_at' | 'metadata'>,
  signal?: AbortSignal,
) {
  if (![input.started_at, input.finished_at].every(Number.isSafeInteger) || input.started_at >= input.finished_at)
    throw new Error('Choose an increasing window in integer microseconds from the recording timeline.');
  const result = await client.rest.POST('/api/v1/episodes', { body: input, signal });
  if (!result.response.ok) throw new CyberwaveError(result.response.status, result.error);
  return result.data!;
}

/** Keep this a separate user action: a failed dataset request must not recreate its Episodes. */
export async function collectEpisodes(
  client: CyberwaveClient,
  name: string,
  episodeIds: string[],
  signal?: AbortSignal,
) {
  if (!name.trim() || !episodeIds.length || episodeIds.some(id => !id.trim()))
    throw new Error('Provide a dataset name and selected Episode UUIDs.');
  const result = await client.rest.POST('/api/v1/datasets', {
    body: { name: name.trim(), episodes: [...new Set(episodeIds)], allow_pending_recordings: false },
    signal,
  });
  if (!result.response.ok) throw new CyberwaveError(result.response.status, result.error);
  // Preserve uuid + status, including an HTTP 200 with status=failed after row creation.
  // The caller should inspect that dataset, not blindly repeat this POST.
  return result.data!;
}

export async function readDataset(client: CyberwaveClient, uuid: string, signal?: AbortSignal) {
  const result = await client.rest.GET('/api/v1/datasets/{uuid}', { params: { path: { uuid } }, signal });
  if (!result.response.ok) throw new CyberwaveError(result.response.status, result.error);
  return result.data!;
}
