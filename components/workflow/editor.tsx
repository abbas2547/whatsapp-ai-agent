"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { saveWorkflowAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Rocket, Save, Trash2 } from "lucide-react";

export type WorkflowAgent = { id: string; name: string };
export type WorkflowIntegration = { id: string; name: string };

export type LoadedWorkflow = {
  id: string;
  name: string;
  enabled: boolean;
  publishState: "DRAFT" | "PUBLISHED";
  nodes: Array<{ id: string; type: string; label?: string | null; positionX: number; positionY: number; data?: unknown }>;
  edges: Array<{ id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null; label?: string | null }>;
};

const TYPE_LABELS: Record<string, string> = {
  TRIGGER: "Trigger",
  AI: "AI agent",
  MESSAGE: "Send message",
  CONDITION: "Condition",
  LEAD: "Lead",
  CONTACT: "Contact",
  CALENDAR: "Calendar",
  EMAIL: "Email",
  HTTP: "HTTP",
  HUMAN: "Transfer to human",
  WAIT: "Wait",
  END: "End",
};

const NODE_TYPES = Object.keys(TYPE_LABELS);

let idCounter = 0;
function uniqueId(prefix: string) {
  idCounter += 1;
  return `${prefix.toLowerCase()}-${idCounter}-${Date.now().toString(36)}`;
}

const TRIGGER_OPTIONS = [
  "conversation.handoff",
  "lead.created",
  "lead.status.changed",
  "whatsapp.message.received",
  "appointment.created",
  "appointment.approaching",
  "webhook.received",
  "manual",
];

function defaultData(type: string): Record<string, unknown> {
  switch (type) {
    case "TRIGGER":
      return { label: TYPE_LABELS[type], trigger: "lead.created" };
    case "AI":
      return { label: TYPE_LABELS[type], agentId: "" };
    case "MESSAGE":
      return { label: TYPE_LABELS[type], text: "", onlyIfNoReply: false };
    case "CONDITION":
      return { label: TYPE_LABELS[type], field: "intent", equals: "" };
    case "LEAD":
      return { label: TYPE_LABELS[type], service: "" };
    case "CONTACT":
      return { label: TYPE_LABELS[type], addTag: "", removeTag: "" };
    case "CALENDAR":
      return { label: TYPE_LABELS[type], title: "Appointment", startAt: "", endAt: "" };
    case "EMAIL":
      return { label: TYPE_LABELS[type], to: "", subject: "", body: "" };
    case "HTTP":
      return { label: TYPE_LABELS[type], integrationName: "" };
    case "HUMAN":
      return { label: TYPE_LABELS[type], reason: "" };
    case "WAIT":
      return { label: TYPE_LABELS[type], minutes: 0 };
    default:
      return { label: TYPE_LABELS[type] || type };
  }
}

function ConfigNode({ data, selected }: NodeProps) {
  return (
    <div
      className={
        "rounded-lg border bg-background px-3 py-2 text-xs shadow-sm " +
        (selected ? "border-primary ring-2 ring-primary/40" : "border-border")
      }
    >
      <Handle type="target" position={Position.Left} className="h-2.5 w-2.5" />
      <p className="font-semibold">{String(data.label || "Node")}</p>
      <Handle type="source" position={Position.Right} className="h-2.5 w-2.5" />
    </div>
  );
}

function ConditionNode({ data, selected }: NodeProps) {
  return (
    <div
      className={
        "rounded-lg border bg-background px-3 py-2 text-xs shadow-sm " +
        (selected ? "border-primary ring-2 ring-primary/40" : "border-border")
      }
    >
      <Handle type="target" position={Position.Left} className="h-2.5 w-2.5" />
      <p className="font-semibold">{String(data.label || "Condition")}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        {String(data.field || "")} = {String(data.equals || "")}
      </p>
      <div className="flex items-center justify-between pt-1">
        <span className="text-[9px] text-emerald-600">true</span>
        <Handle id="true" type="source" position={Position.Bottom} className="!top-auto !bottom-0 h-2.5 w-2.5" />
        <Handle id="false" type="source" position={Position.Bottom} className="!top-auto !bottom-0 h-2.5 w-2.5 translate-x-4" />
        <span className="text-[9px] text-red-600">false</span>
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  TRIGGER: ConfigNode,
  AI: ConfigNode,
  MESSAGE: ConfigNode,
  CONDITION: ConditionNode,
  LEAD: ConfigNode,
  CONTACT: ConfigNode,
  CALENDAR: ConfigNode,
  EMAIL: ConfigNode,
  HTTP: ConfigNode,
  HUMAN: ConfigNode,
  WAIT: ConfigNode,
  END: ConfigNode,
};

type FlowNode = Node<Record<string, unknown>>;
type FlowEdge = Edge;

function EditorInner({
  workflow,
  agents,
  integrations,
}: {
  workflow: LoadedWorkflow | null;
  agents: WorkflowAgent[];
  integrations: WorkflowIntegration[];
}) {
  const router = useRouter();
  const [name, setName] = useState(workflow?.name || "");
  const [enabled, setEnabled] = useState(workflow?.enabled || false);
  const [publishState, setPublishState] = useState<"DRAFT" | "PUBLISHED">(workflow?.publishState || "DRAFT");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const initialNodes = useMemo<FlowNode[]>(
    () =>
      workflow?.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: { x: n.positionX, y: n.positionY },
        data: (n.data as Record<string, unknown>) || { label: TYPE_LABELS[n.type] || n.type },
      })) || [],
    [workflow],
  );

  const initialEdges = useMemo<FlowEdge[]>(
    () =>
      workflow?.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || undefined,
        targetHandle: e.targetHandle || undefined,
        ...(e.label ? { label: e.label } : {}),
      })) || [],
    [workflow],
  );

  const [nodes, setNodes, onNodesChangeInternal] = useNodesState<FlowNode>(initialNodes);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState<FlowEdge>(initialEdges);

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      setSelectedId((id) => {
        const select = changes.find((c) => c.type === "select");
        if (select && "selected" in select) return select.selected ? (select as { id: string }).id : id;
        return id;
      });
      onNodesChangeInternal(changes);
    },
    [onNodesChangeInternal],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdge>[]) => {
      const remove = changes.find((c) => c.type === "remove");
      if (remove) {
        const removed = changes.filter((c) => c.type === "remove").map((c) => (c as { id: string }).id);
        setEdges((eds) => eds.filter((e) => !removed.includes(e.id)));
        return;
      }
      onEdgesChangeInternal(changes);
    },
    [onEdgesChangeInternal, setEdges],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: uniqueId("e"),
            ...(connection.sourceHandle ? { label: connection.sourceHandle } : {}),
          },
          eds,
        ),
      );
    },
    [setEdges],
  );

  function addNode(type: string) {
    const offset = nodes.length * 24;
    const id = uniqueId(type.toUpperCase());
    setNodes((ns) => [
      ...ns,
      {
        id,
        type,
        position: { x: 120 + offset, y: 80 + offset },
        data: defaultData(type),
      },
    ]);
    setSelectedId(id);
  }

  const selected = nodes.find((n) => n.id === selectedId) || null;

  function updateData(patch: Record<string, unknown>) {
    if (!selected) return;
    setNodes((ns) => ns.map((n) => (n.id === selected.id ? { ...n, data: { ...(n.data || {}), ...patch } } : n)));
  }

  function removeSelected() {
    if (!selected) return;
    setNodes((ns) => ns.filter((n) => n.id !== selected.id));
    setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id));
    setSelectedId(null);
  }

  function save(extra?: { publishState?: "DRAFT" | "PUBLISHED"; enabled?: boolean }) {
    startTransition(async () => {
      const payload = {
        name: name.trim() || "Untitled workflow",
        enabled: extra?.enabled ?? enabled,
        publishState: extra?.publishState ?? publishState,
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type,
          label: String(n.data?.label || TYPE_LABELS[n.type as string] || n.type),
          positionX: n.position.x,
          positionY: n.position.y,
          data: n.data || {},
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle || null,
          targetHandle: e.targetHandle || null,
          label: e.label || null,
        })),
      };
      const result = await saveWorkflowAction(workflow?.id, payload);
      if (result.ok) {
        toast.success("Workflow saved");
        if (workflow?.id !== result.id) {
          router.replace(`/automations/${result.id}`);
        }
        setPublishState(extra?.publishState ?? publishState);
        setEnabled(extra?.enabled ?? enabled);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function publish() {
    save({ publishState: "PUBLISHED", enabled: true });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workflow name" className="max-w-xs" />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Enabled
          </label>
          {publishState === "PUBLISHED" ? <Badge variant="success">Published</Badge> : <Badge variant="secondary">Draft</Badge>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={publish} disabled={pending}>
            <Rocket className="h-4 w-4" /> Publish
          </Button>
          <Button size="sm" onClick={() => save()} disabled={pending}>
            <Save className="h-4 w-4" /> Save
          </Button>
        </div>
      </div>

      <div className="flex gap-3">
        <aside className="hidden w-44 shrink-0 flex-col gap-1.5 rounded-xl border p-2 md:flex">
          <p className="px-1 text-xs font-semibold text-muted-foreground">Add node</p>
          {NODE_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => addNode(t)}
              className="rounded-lg px-2 py-1.5 text-left text-xs font-medium hover:bg-muted"
            >
              + {TYPE_LABELS[t]}
            </button>
          ))}
        </aside>

        <div className="h-[560px] min-w-0 flex-1 rounded-xl border">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.3}
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
            <MiniMap nodeColor="#71717a" maskColor="rgba(0,0,0,0.05)" />
          </ReactFlow>
        </div>

        <aside className="hidden w-64 shrink-0 flex-col gap-3 rounded-xl border p-3 lg:flex">
          {selected ? (
            <Inspector
              nodeType={selected.type as string}
              data={(selected.data || {}) as Record<string, unknown>}
              onChange={updateData}
              agents={agents}
              integrations={integrations}
              onRemove={removeSelected}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Select a node to configure it, or add one from the left panel.</p>
          )}
        </aside>
      </div>

      <p className="text-xs text-muted-foreground">
        Start every workflow with a <strong>Trigger</strong> and end with an <strong>End</strong>. Condition nodes route on{" "}
        <code>true</code> / <code>false</code>. On mobile, tap a node to configure it.
      </p>
    </div>
  );
}

function Inspector({
  nodeType,
  data,
  onChange,
  agents,
  integrations,
  onRemove,
}: {
  nodeType: string;
  data: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  agents: WorkflowAgent[];
  integrations: WorkflowIntegration[];
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{TYPE_LABELS[nodeType] || nodeType}</p>
        <button onClick={onRemove} className="text-muted-foreground hover:text-red-600" aria-label="Delete node">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <Field label="Label">
        <Input value={String(data.label || "")} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>

      {nodeType === "TRIGGER" ? (
        <Field label="Trigger event">
          <Select
            value={String(data.trigger || "lead.created")}
            onChange={(e) => onChange({ trigger: e.target.value })}
          >
            {TRIGGER_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {nodeType === "AI" ? (
        <Field label="Agent">
          <Select value={String(data.agentId || "")} onChange={(e) => onChange({ agentId: e.target.value })}>
            <option value="">Select agent…</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {nodeType === "MESSAGE" ? (
        <>
          <Field label="Text">
            <Textarea value={String(data.text || "")} onChange={(e) => onChange({ text: e.target.value })} placeholder="Use {{reply}} to inject agent reply" />
          </Field>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={Boolean(data.onlyIfNoReply)} onChange={(e) => onChange({ onlyIfNoReply: e.target.checked })} />
            Only if no customer reply
          </label>
        </>
      ) : null}

      {nodeType === "CONDITION" ? (
        <>
          <Field label="Field">
            <Input value={String(data.field || "intent")} onChange={(e) => onChange({ field: e.target.value })} placeholder="intent" />
          </Field>
          <Field label="Equals">
            <Input value={String(data.equals || "")} onChange={(e) => onChange({ equals: e.target.value })} />
          </Field>
        </>
      ) : null}

      {nodeType === "LEAD" ? (
        <Field label="Service">
          <Input value={String(data.service || "")} onChange={(e) => onChange({ service: e.target.value })} />
        </Field>
      ) : null}

      {nodeType === "CONTACT" ? (
        <>
          <Field label="Add tag">
            <Input value={String(data.addTag || "")} onChange={(e) => onChange({ addTag: e.target.value })} />
          </Field>
          <Field label="Remove tag">
            <Input value={String(data.removeTag || "")} onChange={(e) => onChange({ removeTag: e.target.value })} />
          </Field>
        </>
      ) : null}

      {nodeType === "CALENDAR" ? (
        <>
          <Field label="Title">
            <Input value={String(data.title || "")} onChange={(e) => onChange({ title: e.target.value })} />
          </Field>
          <Field label="Start">
            <Input type="datetime-local" value={String(data.startAt || "")} onChange={(e) => onChange({ startAt: e.target.value })} />
          </Field>
          <Field label="End">
            <Input type="datetime-local" value={String(data.endAt || "")} onChange={(e) => onChange({ endAt: e.target.value })} />
          </Field>
        </>
      ) : null}

      {nodeType === "EMAIL" ? (
        <>
          <Field label="To">
            <Input value={String(data.to || "")} onChange={(e) => onChange({ to: e.target.value })} />
          </Field>
          <Field label="Subject">
            <Input value={String(data.subject || "")} onChange={(e) => onChange({ subject: e.target.value })} />
          </Field>
          <Field label="Body">
            <Textarea value={String(data.body || "")} onChange={(e) => onChange({ body: e.target.value })} />
          </Field>
        </>
      ) : null}

      {nodeType === "HTTP" ? (
        <Field label="Integration">
          <Select
            value={String(data.integrationName || "")}
            onChange={(e) => onChange({ integrationName: e.target.value })}
          >
            <option value="">Select integration…</option>
            {integrations.map((i) => (
              <option key={i.id} value={i.name}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {nodeType === "HUMAN" ? (
        <Field label="Reason">
          <Input value={String(data.reason || "")} onChange={(e) => onChange({ reason: e.target.value })} />
        </Field>
      ) : null}

      {nodeType === "WAIT" ? (
        <Field label="Minutes">
          <Input
            type="number"
            value={Number(data.minutes || 0)}
            onChange={(e) => onChange({ minutes: Number(e.target.value) })}
          />
        </Field>
      ) : null}

      {nodeType !== "TRIGGER" && nodeType !== "END" ? (
        <p className="text-[11px] text-muted-foreground">Uses {String(data.label || "this node")} to send the agent&apos;s reply.</p>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}

export function WorkflowEditor(props: {
  workflow: LoadedWorkflow | null;
  agents: WorkflowAgent[];
  integrations: WorkflowIntegration[];
}) {
  return (
    <ReactFlowProvider>
      <EditorInner {...props} />
    </ReactFlowProvider>
  );
}