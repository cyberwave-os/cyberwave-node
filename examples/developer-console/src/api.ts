import type { Anchor, Draft, Twin, Waypoint } from './domain.ts';

export type Snapshot = {
  mode: 'fixture' | 'connected'; environmentUuid: string;
  anchor: Anchor; executionEnabled: boolean;
  twins: Twin[]; waypoints: Waypoint[]; unsupportedWaypoints: number;
};
export type Action = { action_id: string; status: string; message?: string };

export async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

/** Replace these method implementations with generated SDK operations later. */
export const cyberwave = {
  snapshot: () => request<Snapshot>('/api/snapshot'),
  execute: (twinUuid: string, draft: Draft) => request<Action>(`/api/twins/${twinUuid}/execute`, { draft }),
  status: (twinUuid: string, actionId: string) => request<Action>(`/api/twins/${twinUuid}/actions/${actionId}`),
  cancel: (twinUuid: string, actionId: string) => request<Action>(`/api/twins/${twinUuid}/actions/${actionId}/cancel`, {}),
  frame: async (twinUuid: string): Promise<Blob> => {
    const response = await fetch(`/api/twins/${twinUuid}/frame`);
    if (!response.ok) throw new Error('No latest camera frame is available.');
    return response.blob();
  },
};
