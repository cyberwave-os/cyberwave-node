import { WorkflowCatalog as Catalog } from "@cyberwave/react";
import type { ComponentProps } from "react";
/** The demo gateway permits writes to loopback APIs only. Applications set their own policy. */
export function WorkflowCatalog(props: ComponentProps<typeof Catalog>) {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(props.client.baseUrl).hostname,
  );
  return <Catalog {...props} readOnly={!local} serverPagination={local} />;
}
