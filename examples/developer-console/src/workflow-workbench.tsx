import { useState } from "react";
import { EnvironmentBrowser } from "@cyberwave/react";
import type { CyberwaveClient, Environment } from "cyberwave";
import { WorkflowCatalog } from "./workflow-catalog.tsx";

export function WorkflowWorkbench({ client }: { client: CyberwaveClient }) {
  const [environment, setEnvironment] = useState<Environment>();
  const [workspace, setWorkspace] = useState("");
  const [scope, setScope] = useState<{
    environmentId?: string;
    workspaceId?: string;
  }>({});
  return (
    <div className="workbench-grid">
      <aside className="panel">
        <h2>Choose scope</h2>
        <EnvironmentBrowser
          selectedId={environment?.uuid}
          onSelect={(env) => {
            setEnvironment(env);
            setScope({ environmentId: env.uuid });
          }}
        />
        <div className="section-gap fields span-2">
          <label className="span-2">
            Workspace UUID
            <input
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              placeholder="For a workspace-wide overview"
            />
          </label>
          <button
            className="cw-button"
            disabled={!workspace.trim()}
            onClick={() => {
              setEnvironment(undefined);
              setScope({ workspaceId: workspace.trim() });
            }}
          >
            Load workspace workflows
          </button>
        </div>
      </aside>
      <section className="panel">
        <WorkflowCatalog
          key={scope.environmentId ?? scope.workspaceId ?? "none"}
          client={client}
          {...scope}
        />
      </section>
    </div>
  );
}
