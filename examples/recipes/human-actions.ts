import { CyberwaveError, type CyberwaveClient, type HumanActionResponse } from '../../dist/index.js';

/** The backend filters by the authenticated assignee and workspace scope. */
export async function listHumanActions(client: CyberwaveClient, workspaceUuid?: string, signal?: AbortSignal) {
  const result = await client.rest.GET('/api/v1/workflow-actions', { params: { query: { workspace_uuid: workspaceUuid } }, signal });
  if (!result.response.ok) throw new CyberwaveError(result.response.status, result.error);
  return result.data!;
}

/** Repeating the same answer is idempotent. A different answer after acceptance returns 409. */
export async function respondToAction(client: CyberwaveClient, uuid: string, response: HumanActionResponse, signal?: AbortSignal) {
  const result = await client.rest.POST('/api/v1/workflow-actions/{uuid}/respond', { params: { path: { uuid } }, body: response, signal });
  if (!result.response.ok) throw new CyberwaveError(result.response.status, result.error);
  return result.data!;
}
