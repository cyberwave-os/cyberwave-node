import { createCyberwave, DEFAULT_API_URL, type ClientOptions } from 'cyberwave';
export type Connection = { connectionId: string; baseUrl: string; authenticated: boolean };
async function json(response: Response) { const data = await response.json(); if (!response.ok) throw new Error(data.detail || `Connection failed (${response.status})`); return data; }
export const connect = (baseUrl = DEFAULT_API_URL, token?: string): Promise<Connection> => fetch('/gateway/connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseUrl, token }) }).then(json);
export async function restoreConnection(): Promise<Connection> {
  const response = await fetch('/gateway/connection'); return response.ok ? response.json() : connect();
}
export const disconnect = () => fetch('/gateway/connection', { method: 'DELETE' }).then(json);
export const mediaUrl = (url: string) => `/gateway/media?url=${encodeURIComponent(url)}`;
/** Example-only same-origin transport. The SDK also works directly in Node or with API CORS configured. */
export function connectedClient(connection: Connection) {
  const proxyFetch: ClientOptions['fetch'] = async input => {
    const request = input instanceof Request ? input : new Request(input);
    const url = new URL(request.url);
    return fetch(`/gateway/rest${url.pathname}${url.search}`, { method:request.method, body:request.method==='GET'?undefined:await request.text(), headers:{'Content-Type':'application/json', 'X-Cyberwave-Connection':connection.connectionId}, signal: request.signal, credentials: 'same-origin' });
  };
  return createCyberwave({ baseUrl: connection.baseUrl, fetch: proxyFetch });
}
