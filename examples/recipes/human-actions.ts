import { type CyberwaveClient, type HumanActionResponse } from '../../dist/index.js';

/** The backend filters by the authenticated assignee and workspace scope. */
export async function listHumanActions(client: CyberwaveClient, workspaceUuid?: string, signal?: AbortSignal) {
  return client.humanActions.list({ workspace_uuid: workspaceUuid }, { signal });
}

/** Repeating the same answer is idempotent. A different answer after acceptance returns 409. */
export async function respondToAction(client: CyberwaveClient, uuid: string, response: HumanActionResponse, signal?: AbortSignal) {
  return client.humanActions.respond(uuid, response, { signal });
}
