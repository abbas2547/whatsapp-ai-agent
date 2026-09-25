"use client";

import dynamic from "next/dynamic";
import type { LoadedWorkflow, WorkflowAgent, WorkflowIntegration } from "./editor";

const Editor = dynamic(
  () => import("./editor").then((m) => m.WorkflowEditor),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground">Loading editor…</p> },
);

export function WorkflowEditorLoader({
  workflow,
  agents,
  integrations,
}: {
  workflow: LoadedWorkflow | null;
  agents: WorkflowAgent[];
  integrations: WorkflowIntegration[];
}) {
  return <Editor workflow={workflow} agents={agents} integrations={integrations} />;
}