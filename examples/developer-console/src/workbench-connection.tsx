import { useEffect, useMemo, useState, type ReactNode } from "react";
import { type CyberwaveClient } from "cyberwave";
import { CyberwaveProvider } from "@cyberwave/react";
import {
  connectedClient,
  restoreConnection,
  type Connection,
} from "./connection.ts";
export function ConnectedWorkbench({
  children,
}: {
  children: (client: CyberwaveClient) => ReactNode;
}) {
  const [connection, setConnection] = useState<Connection>(),
    [error, setError] = useState("");
  const client = useMemo(
    () => (connection ? connectedClient(connection) : undefined),
    [connection],
  );
  useEffect(() => {
    let active = true;
    restoreConnection()
      .then((c) => {
        if (active) setConnection(c);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      {error && (
        <p role="alert" className="cw-error">
          {error}
        </p>
      )}
      {client && (
        <CyberwaveProvider key={connection?.connectionId} client={client}>
          {children(client)}
        </CyberwaveProvider>
      )}
    </>
  );
}
export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
