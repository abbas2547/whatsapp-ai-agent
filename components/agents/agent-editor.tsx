"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveAgentAction, publishAgentAction, testAgentAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/select";
import { AGENT_GOALS } from "./goals";

export type AgentEditorValue = {
  id?: string;
  name: string;
  avatar?: string | null;
  description?: string | null;
  businessDescription?: string | null;
  personality?: string | null;
  tone?: string | null;
  language?: string | null;
  goal?: string | null;
  systemInstructions?: string | null;
  rules?: string | null;
  prohibitedActions?: string | null;
  escalationRules?: string | null;
  fallbackResponse?: string | null;
  status?: string | null;
  whatsappPhoneNumberId?: string | null;
  enabledTools: string[];
  knowledgeBaseIds: string[];
};

const PRESETS: { name: string; personality: string; tone: string; systemInstructions: string }[] = [
  {
    name: "Professional",
    personality: "Calm, precise, and courteous. Keeps replies short and clear.",
    tone: "Professional",
    systemInstructions: "Always be polite and concise. Confirm details before booking or promising anything.",
  },
  {
    name: "Friendly",
    personality: "Warm, upbeat, and helpful. Uses simple language and light emoji sparingly.",
    tone: "Friendly",
    systemInstructions: "Greet warmly, keep replies under 3 sentences, and always offer next steps.",
  },
  {
    name: "Sales",
    personality: "Confident and persuasive without pressure. Asks one qualifying question at a time.",
    tone: "Confident, friendly",
    systemInstructions: "Qualify budget, timeline, and need. Never invent prices — check knowledge first.",
  },
  {
    name: "Support",
    personality: "Patient and thorough. Confirms understanding before answering.",
    tone: "Patient, professional",
    systemInstructions: "Troubleshoot step by step. Escalate to a human when the issue is unresolved after 2 tries.",
  },
  {
    name: "Concierge",
    personality: "Attentive and proactive. Anticipates needs and offers options.",
    tone: "Attentive, warm",
    systemInstructions: "Offer 2-3 concrete options with times or choices. Confirm bookings explicitly.",
  },
];

export function AgentEditor({
  agent,
  phones,
  knowledge,
  toolNames,
}: {
  agent: AgentEditorValue | null;
  phones: { id: string; displayPhoneNumber: string }[];
  knowledge: { id: string; name: string }[];
  toolNames: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<AgentEditorValue>({
    id: agent?.id,
    name: agent?.name || "",
    avatar: agent?.avatar ?? "",
    description: agent?.description ?? "",
    businessDescription: agent?.businessDescription ?? "",
    personality: agent?.personality ?? "",
    tone: agent?.tone ?? "",
    language: agent?.language ?? "en",
    goal: agent?.goal ?? "GENERAL_ASSISTANT",
    systemInstructions: agent?.systemInstructions ?? "",
    rules: agent?.rules ?? "",
    prohibitedActions: agent?.prohibitedActions ?? "",
    escalationRules: agent?.escalationRules ?? "",
    fallbackResponse: agent?.fallbackResponse ?? "",
    status: agent?.status ?? "DRAFT",
    whatsappPhoneNumberId: agent?.whatsappPhoneNumberId ?? null,
    enabledTools: agent?.enabledTools ?? [],
    knowledgeBaseIds: agent?.knowledgeBaseIds ?? [],
  });

  const set = (key: keyof AgentEditorValue, value: unknown) => setValues((v) => ({ ...v, [key]: value }));

  function toggleTool(name: string) {
    const current = values.enabledTools.includes(name);
    set("enabledTools", current ? values.enabledTools.filter((t) => t !== name) : [...values.enabledTools, name]);
  }

  function toggleKnowledge(id: string) {
    const current = values.knowledgeBaseIds.includes(id);
    set("knowledgeBaseIds", current ? values.knowledgeBaseIds.filter((k) => k !== id) : [...values.knowledgeBaseIds, id]);
  }

  function payload() {
    return {
      name: values.name,
      avatar: values.avatar || undefined,
      description: values.description || undefined,
      businessDescription: values.businessDescription || undefined,
      personality: values.personality || undefined,
      tone: values.tone || undefined,
      language: values.language || undefined,
      goal: values.goal || undefined,
      systemInstructions: values.systemInstructions || undefined,
      rules: values.rules || undefined,
      prohibitedActions: values.prohibitedActions || undefined,
      escalationRules: values.escalationRules || undefined,
      fallbackResponse: values.fallbackResponse || undefined,
      status: values.status || undefined,
      whatsappPhoneNumberId: values.whatsappPhoneNumberId || null,
      enabledTools: values.enabledTools,
      knowledgeBaseIds: values.knowledgeBaseIds,
    };
  }

  function save() {
    startTransition(async () => {
      const result = await saveAgentAction(values.id, payload());
      if (result.ok) {
        toast.success(values.id ? "Agent saved" : "Agent created");
        router.replace(`/agents/${result.agent.id}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function publish() {
    startTransition(async () => {
      const result = await publishAgentAction(values.id!);
      if (result.ok) {
        toast.success("Agent published and now active");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>1 · Basic information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Name (required)">
              <Input value={values.name} onChange={(e) => set("name", e.target.value)} required />
            </Field>
            <Field label="Avatar emoji">
              <Input value={values.avatar || ""} onChange={(e) => set("avatar", e.target.value)} placeholder="🤖" />
            </Field>
            <Field label="Goal">
              <Select value={values.goal || "GENERAL_ASSISTANT"} onChange={(e) => set("goal", e.target.value)}>
                {AGENT_GOALS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Language">
              <Select value={values.language || "en"} onChange={(e) => set("language", e.target.value)}>
                {["en", "es", "hi", "ar", "fr", "pt", "de"].map((l) => (
                  <option key={l} value={l}>
                    {l.toUpperCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Short description" className="sm:col-span-2">
              <Input value={values.description || ""} onChange={(e) => set("description", e.target.value)} placeholder="Replies to sales questions" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2 · Personality</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div>
              <p className="mb-2 text-[13px] font-semibold">Presets</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Personality presets">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => {
                      set("personality", p.personality);
                      set("tone", p.tone);
                      setValues((v) => ({ ...v, systemInstructions: v.systemInstructions || p.systemInstructions }));
                    }}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold shadow-sm transition-all hover:border-primary hover:bg-primary/5 hover:text-primary"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Tone">
              <Input value={values.tone || ""} onChange={(e) => set("tone", e.target.value)} placeholder="Friendly, professional" />
            </Field>
            <Field label="Personality" className="sm:col-span-2">
              <Textarea value={values.personality || ""} onChange={(e) => set("personality", e.target.value)} placeholder="Energetic and helpful…" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3 · Instructions & business rules</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Business description">
              <Textarea
                value={values.businessDescription || ""}
                onChange={(e) => set("businessDescription", e.target.value)}
                placeholder="What does your business do? What do you sell?"
              />
            </Field>
            <Field label="System instructions">
              <Textarea
                value={values.systemInstructions || ""}
                onChange={(e) => set("systemInstructions", e.target.value)}
                placeholder="Specific instructions you want the agent to always follow."
              />
            </Field>
            <Field label="Rules">
              <Textarea value={values.rules || ""} onChange={(e) => set("rules", e.target.value)} placeholder="What the agent must do." />
            </Field>
            <Field label="Prohibited actions">
              <Textarea value={values.prohibitedActions || ""} onChange={(e) => set("prohibitedActions", e.target.value)} placeholder="What the agent must never do." />
            </Field>
            <Field label="Escalation rules">
              <Textarea value={values.escalationRules || ""} onChange={(e) => set("escalationRules", e.target.value)} placeholder="When should the agent transfer to a human?" />
            </Field>
            <Field label="Fallback response">
              <Textarea value={values.fallbackResponse || ""} onChange={(e) => set("fallbackResponse", e.target.value)} placeholder="Used when the agent cannot answer." />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4 · Knowledge & tools</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div>
              <p className="mb-2 text-sm font-medium">Tools</p>
              <div className="flex flex-wrap gap-2">
                {toolNames.map((name) => (
                  <label
                    key={name}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
                  >
                    <Checkbox checked={values.enabledTools.includes(name)} onChange={() => toggleTool(name)} />
                    {name.replaceAll("_", " ")}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Knowledge bases</p>
              {knowledge.length ? (
                <div className="flex flex-wrap gap-2">
                  {knowledge.map((kb) => (
                    <label
                      key={kb.id}
                      className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
                    >
                      <Checkbox checked={values.knowledgeBaseIds.includes(kb.id)} onChange={() => toggleKnowledge(kb.id)} />
                      {kb.name}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No knowledge bases yet. Create one in{" "}
                  <button type="button" className="underline" onClick={() => router.push("/knowledge")}>
                    Knowledge
                  </button>{" "}
                  to give your agent approved answers.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-5">
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle>5 · WhatsApp & publish</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="WhatsApp number">
              <Select
                value={values.whatsappPhoneNumberId || ""}
                onChange={(e) => set("whatsappPhoneNumberId", e.target.value || null)}
              >
                <option value="">Any available number</option>
                {phones.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayPhoneNumber}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={values.status || "DRAFT"} onChange={(e) => set("status", e.target.value)}>
                {["DRAFT", "TESTING", "ACTIVE", "PAUSED"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={save} disabled={pending || values.name.trim().length < 2} loading={pending}>
              {pending ? "Saving…" : values.id ? "Save changes" : "Create agent"}
            </Button>
            {values.id ? (
              <>
                <Button variant="outline" onClick={publish} disabled={pending} loading={pending}>
                  Publish (make active)
                </Button>
                <p className="text-xs leading-5 text-muted-foreground">
                  Publishing performs a real backend check and marks the agent ACTIVE. Requires business information or system instructions.
                </p>
                {!phones.length ? (
                  <p className="rounded-xl bg-amber-500/10 p-2.5 text-xs leading-5 text-amber-700 dark:text-amber-300">
                    No WhatsApp numbers connected yet. Connect one in Integrations so this agent can receive messages.
                  </p>
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>

        {values.id ? <AgentTester agentId={values.id} /> : null}
      </div>
    </div>
  );
}

function AgentTester({ agentId }: { agentId: string }) {
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string; ms?: number; tools?: string[] }>>([]);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    if (!message.trim() || pending) return;
    const outgoing = message.trim();
    startTransition(async () => {
      const result = await testAgentAction(agentId, outgoing, history.map((h) => ({ role: h.role, content: h.content })));
      if (result.ok) {
        const tools = Array.isArray((result as { toolCalls?: Array<{ name: string }> }).toolCalls)
          ? (result as { toolCalls: Array<{ name: string }> }).toolCalls.map((t) => t.name)
          : [];
        setHistory((h) => [...h, { role: "user", content: outgoing }, { role: "assistant", content: result.reply, ms: result.responseTimeMs, tools }]);
        setResponseTime(result.responseTimeMs);
        setMessage("");
        if (result.error) {
          toast.error(`Turn finished with error: ${result.error}`);
        }
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-muted/40">
        <CardTitle>6 · Live test chat</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-4">
        <div className="wa-chat-bg flex max-h-80 min-h-48 flex-col gap-1.5 overflow-y-auto rounded-xl border border-border p-3" aria-live="polite">
          {history.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">Talk to the agent before publishing. Messages call the real configured AI provider.</p>
          )}
          {history.map((h, i) => (
            <div key={i} className={h.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  h.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-md bg-[#d9fdd3] px-3 py-1.5 text-xs text-gray-900 shadow-sm dark:bg-emerald-900 dark:text-emerald-50"
                    : "max-w-[85%] rounded-2xl rounded-bl-md bg-white px-3 py-1.5 text-xs text-gray-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                }
              >
                <p className="whitespace-pre-wrap break-words">{h.content}</p>
                {h.ms != null && h.role === "assistant" && (
                  <p className="mt-1 text-[10px] tabular-nums opacity-60">
                    {h.ms} ms{h.tools?.length ? ` · ${h.tools.length} tool${h.tools.length === 1 ? "" : "s"}` : ""}
                  </p>
                )}
              </div>
            </div>
          ))}
          {pending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 shadow-sm dark:bg-zinc-800" role="status" aria-label="Agent is thinking">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="h-1.5 w-1.5 rounded-full bg-muted-foreground" style={{ animation: `typing-dot 1.2s infinite ${d * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Send a test message…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            aria-label="Test message"
          />
          <Button onClick={send} disabled={pending || !message.trim()} loading={pending} aria-label="Send test message">
            {!pending && "Send"}
          </Button>
        </div>
        {responseTime ? <p className="text-xs tabular-nums text-muted-foreground">Last reply in {responseTime} ms</p> : null}
      </CardContent>
    </Card>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}