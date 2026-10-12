import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConnectionPanel } from "@cyberwave/react";
import { DEFAULT_API_URL } from "cyberwave";
import { connect, restoreConnection, type Connection } from "./connection.ts";
import "@cyberwave/react/styles.css";

function HeaderConnection() {
  const [connection, setConnection] = useState<Connection>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    restoreConnection()
      .then((value) => {
        if (active) setConnection(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function change(baseUrl: string, token?: string) {
    await connect(baseUrl, token);
    // These are separate HTML examples. Navigation is the reset boundary for
    // requests, loaded models, previews and drafts; pagehide releases controls.
    location.reload();
  }
  return (
    <details className="example-connection">
      <summary aria-label="Change API connection">
        <span className="example-api-label">
          API · {connection?.authenticated ? "Authenticated" : "Public"}
        </span>
        <strong>
          {connection?.baseUrl ??
            (error ? "Connection unavailable" : "Connecting…")}
        </strong>
        <span aria-hidden="true">⌄</span>
      </summary>
      <div className="example-connection-popover">
        <h2>Connect your Cyberwave API</h2>
        <ConnectionPanel
          baseUrl={connection?.baseUrl ?? DEFAULT_API_URL}
          authenticated={connection?.authenticated}
          onConnect={(input) => change(input.baseUrl, input.token)}
          onDisconnect={() => change(DEFAULT_API_URL)}
          disconnectLabel="Reset to public"
        />
        {error && (
          <p role="alert" className="cw-error">
            {error}
          </p>
        )}
        <p>
          Changing API reloads this example and clears its local draft. Export
          work you want to keep. Navigation between examples keeps the same
          gateway session.
        </p>
        <p>
          Tokens stay in gateway memory. Controllers and fixture telemetry use
          the separate server-configured command target; this selector does not
          retarget them.
        </p>
      </div>
    </details>
  );
}

export function mountHeaderConnection(container: HTMLElement) {
  createRoot(container).render(<HeaderConnection />);
}
