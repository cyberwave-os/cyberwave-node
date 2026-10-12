import type { SensorTelemetryTransport } from "cyberwave";
import { restoreConnection } from "./connection.ts";
/** Same-origin example adapter. Production hosts supply their authenticated transport. */
export function sensorTransportFor(sensorId: string): SensorTelemetryTransport {
  return {
    async subscribe(topic, onMessage) {
      const match = topic.match(/^localcyberwave\/twin\/([^/]+)\/(.+)$/);
      if (!match) throw new Error("This example uses the local broker.");
      const connection = await restoreConnection(),
        abort = new AbortController();
      const query = new URLSearchParams({
        twin: match[1],
        channel: match[2],
        sensor: sensorId,
      });
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const response = await fetch(`/gateway/sensor-events?${query}`, {
          headers: { "X-Cyberwave-Connection": connection.connectionId },
          signal: abort.signal,
        });
        if (!response.ok)
          throw new Error(
            (await response.json()).detail ||
              `Telemetry rejected (${response.status})`,
          );
        if (!response.body)
          throw new Error("Streaming responses are unavailable.");
        reader = response.body.getReader();
      } catch (error) {
        abort.abort();
        throw error;
      }
      const pump = async () => {
        const decoder = new TextDecoder();
        let pending = "";
        try {
          while (!abort.signal.aborted) {
            const { done, value } = await reader!.read();
            if (done) break;
            pending += decoder.decode(value, { stream: true });
            if (pending.length > 2 * 1024 * 1024)
              throw new Error("Telemetry packet too large.");
            let newline;
            while ((newline = pending.indexOf("\n")) >= 0) {
              const line = pending.slice(0, newline);
              pending = pending.slice(newline + 1);
              if (line.trim()) onMessage(JSON.parse(line));
            }
          }
        } catch {
          /* No reconnect or replay; the panel marks the last sample stale. */
        } finally {
          abort.abort();
          reader?.releaseLock();
        }
      };
      void pump();
      return () => abort.abort();
    },
  };
}
