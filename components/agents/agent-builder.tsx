"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CalendarCheck2,
  CalendarDays,
  Check,
  ClipboardList,
  Database,
  FlaskConical,
  Globe,
  ListChecks,
  Mail,
  Pencil,
  Phone,
  Plug,
  RefreshCw,
  Rocket,
  Smile,
  Tag,
  UserPlus,
  Users,
  Wrench,
  Crosshair,
  Contact as ContactIcon,
  type LucideIcon,
} from "lucide-react";
import { saveAgentAction } from "@/app/actions/agents";
import { Button } from "@/components/ui/button";
import { usePersistentState, removeStored } from "@/hooks/use-persistent-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AgentStatusBadge } from "@/components/status-badges";
import { AgentDeleteButton } from "@/components/agents/agent-delete-button";
import { AgentTester } from "@/components/agents/agent-tester";
import { AGENT_GOALS } from "./goals";
import { cn } from "@/lib/utils";

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

export type BuilderPhone = { id: string; displayPhoneNumber: string; verifiedName?: string | null };
export type BuilderKnowledge = { id: string; name: string; documents: { status: string }[] };
export type BuilderTool = { name: string; description: string };

const TOOL_ICONS: Record<string, LucideIcon> = {
  search_knowledge: Database,
  get_contact: ContactIcon,
  update_contact: Pencil,
  create_lead: Crosshair,
  update_lead: RefreshCw,
  add_tag: Tag,
  remove_tag: Tag,
  transfer_to_human: UserPlus,
  check_calendar_availability: CalendarDays,
  book_appointment: CalendarCheck2,
  send_email: Mail,
  http_request: Globe,
};

const TOOL_TITLES: Record<string, string> = {
  search_knowledge: "Knowledge Search",
  get_contact: "Contact Lookup",
  update_contact: "Contact Update",
  create_lead: "Lead Creation",
  update_lead: "Lead Update",
  add_tag: "Add Tags",
  remove_tag: "Remove Tags",
  transfer_to_human: "Human Handoff",
  check_calendar_availability: "Calendar Availability",
  book_appointment: "Appointment Booking",
  send_email: "Email",
  http_request: "HTTP / API",
};

const STEPS: { key: string; title: string; hint: string; icon: LucideIcon }[] = [
  { key: "basic", title: "Basic", hint: "Name, goal and language", icon: ClipboardList },
  { key: "personality", title: "Personality", hint: "Tone and style presets", icon: Smile },
  { key: "instructions", title: "Instructions", hint: "Rules and boundaries", icon: ListChecks },
  { key: "knowledge", title: "Knowledge", hint: "Approved answers", icon: Database },
  { key: "tools", title: "Tools", hint: "What the agent can do", icon: Wrench },
  { key: "whatsapp", title: "WhatsApp", hint: "Connect a number", icon: Phone },
  { key: "test", title: "Test", hint: "Live chat preview", icon: FlaskConical },
  { key: "publish", title: "Publish", hint: "Review and go live", icon: Rocket },
];

const PRESETS: { name: string; blurb: string; personality: string; tone: string; icon: LucideIcon }[] = [
  { name: "Professional", blurb: "Calm, precise, courteous", personality: "Calm, precise, and courteous. Keeps replies short and clear.", tone: "Professional", icon: Bot },
  { name: "Friendly", blurb: "Warm, upbeat, helpful", personality: "Warm, upbeat, and helpful. Uses simple language and light emoji sparingly.", tone: "Friendly", icon: Smile },
  { name: "Sales", blurb: "Confident, qualifying", personality: "Confident and persuasive without pressure. Asks one qualifying question at a time.", tone: "Confident, friendly", icon: Crosshair },
  { name: "Support", blurb: "Patient, thorough", personality: "Patient and thorough. Confirms understanding before answering.", tone: "Patient, professional", icon: Users },
  { name: "Concierge", blurb: "Attentive, proactive", personality: "Attentive and proactive. Anticipates needs and offers options.", tone: "Attentive, warm", icon: Check },
];

export function AgentBuilder({
  agent,
  phones,
  knowledge,
  tools,
  aiStatus,
}: {
  agent: AgentEditorValue | null;
  phones: BuilderPhone[];
  knowledge: BuilderKnowledge[];
  tools: BuilderTool[];
  aiStatus?: { provider: string; model: string; connected: boolean };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Draft persistence: refresh / step navigation / back-forward never loses
  // typed content. Keyed per agent (or "new"), stored in localStorage.
  const draftKey = `agent-draft:${agent?.id || "new"}`;
  const [step, setStep] = usePersistentState<number>(`${draftKey}:step`, 0);
  const [publishOpen, setPublishOpen] = useState(false);
  // If a draft was restored from a previous visit, surface it as unsaved work.
  const [dirty, setDirty] = useState(() => {
    if (agent?.id || typeof window === "undefined") return false;
    try {
      const raw = window.localStorage.getItem("agent-draft:new:values");
      if (!raw) return false;
      const d = JSON.parse(raw) as Partial<AgentEditorValue>;
      return !!(
        (typeof d.name === "string" && d.name.trim()) ||
        (typeof d.businessDescription === "string" && d.businessDescription.trim()) ||
        (typeof d.systemInstructions === "string" && d.systemInstructions.trim())
      );
    } catch {
      return false;
    }
  });
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<{ message: string; upgradePlan?: "starter" | "pro" | "business" } | null>(null);
  const [values, setValuesInner] = usePersistentState<AgentEditorValue>(`${draftKey}:values`, {
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

  function setValues(updater: AgentEditorValue | ((v: AgentEditorValue) => AgentEditorValue)) {
    setValuesInner(updater);
  }

  function set(key: keyof AgentEditorValue, value: unknown) {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty(true);
    setSaveError(null);
  }

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

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

  function save(onDone?: (id: string) => void) {
    startTransition(async () => {
      const wasNew = !values.id;
      const result = await saveAgentAction(values.id, payload());
      if (result.ok) {
        setDirty(false);
        setSavedAt(new Date());
        setValues((v) => ({ ...v, id: result.agent.id }));
        toast.success(wasNew ? "Agent created" : "Draft saved");
        if (wasNew) {
          // Fresh agent now has its own draft key — drop the shared "new"
          // draft so the next "New agent" starts blank, not with old text.
          removeStored("agent-draft:new:values");
          removeStored("agent-draft:new:step");
          router.replace(`/agents/${result.agent.id}`);
        }
        router.refresh();
        onDone?.(result.agent.id);
      } else {
        setSaveError({
          message: result.error,
          upgradePlan: "upgradePlan" in result ? (result.upgradePlan as "starter" | "pro" | "business" | undefined) : undefined,
        });
        toast.error(result.error);
      }
    });
  }

  function publish() {
    if (!values.id) {
      // Save first, then publish the fresh id.
      save((id) => publishById(id));
      return;
    }
    publishById(values.id);
  }

  function publishById(id: string) {
    startTransition(async () => {
      const { publishAgentAction } = await import("@/app/actions/agents");
      const result = await publishAgentAction(id);
      if (result.ok) {
        setValues((v) => ({ ...v, status: "ACTIVE" }));
        setDirty(false);
        setPublishOpen(false);
        toast.success("AI Employee published");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function toggleTool(name: string) {
    const current = values.enabledTools.includes(name);
    set("enabledTools", current ? values.enabledTools.filter((t) => t !== name) : [...values.enabledTools, name]);
  }

  function toggleKnowledge(id: string) {
    const current = values.knowledgeBaseIds.includes(id);
    set("knowledgeBaseIds", current ? values.knowledgeBaseIds.filter((k) => k !== id) : [...values.knowledgeBaseIds, id]);
  }

  const goalLabel = AGENT_GOALS.find((g) => g.value === values.goal)?.label || values.goal || "General assistant";
  const readyChecks = {
    name: values.name.trim().length >= 2,
    instructions: !!((values.businessDescription || "").trim() || (values.systemInstructions || "").trim()),
  };
  const canPublish = readyChecks.name && readyChecks.instructions;
  const linkedPhone = phones.find((p) => p.id === values.whatsappPhoneNumberId);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/agents" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Agents
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-lg" aria-hidden>
            {values.avatar || <Bot className="h-5 w-5 text-primary" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold tracking-tight">{values.name || "Untitled agent"}</h1>
              {values.status && <AgentStatusBadge status={values.status as "DRAFT" | "TESTING" | "ACTIVE" | "PAUSED"} />}
            </div>
            <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
              {pending ? "Saving…" : saveError ? `Unable to save — ${saveError.message}` : dirty ? "Unsaved changes" : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : values.id ? "No unsaved changes" : "New draft"}
            </p>
            {saveError?.upgradePlan ? (
              <Link
                href={`/pricing?plan=${saveError.upgradePlan}`}
                className="mt-1 inline-flex w-fit items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Upgrade to {saveError.upgradePlan === "starter" ? "Starter" : saveError.upgradePlan === "pro" ? "Pro" : "Business"} to create more <ArrowRight className="h-3 w-3" />
              </Link>
            ) : null}
          </div>
        </div>
        <Button variant="outline" onClick={() => save()} loading={pending} disabled={pending || values.name.trim().length < 2}>
          Save draft
        </Button>
        {values.id ? (
          <AgentDeleteButton agentId={values.id} agentName={values.name || "this agent"} redirectTo="/agents" />
        ) : null}
      </div>

      {/* Mobile step progress */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Step {step + 1} of {STEPS.length} · {STEPS[step].title}</span>
          <span>{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[220px_minmax(0,1fr)_340px] lg:grid-cols-[200px_minmax(0,1fr)]">
        {/* Step nav */}
        <nav aria-label="Agent builder steps" className="hidden lg:block">
          <ol className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-2">
            {STEPS.map((s, i) => {
              const activeStep = i === step;
              const complete = isStepComplete(i, values);
              return (
                <li key={s.key}>
                  <button
                    onClick={() => setStep(i)}
                    aria-current={activeStep ? "step" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all",
                      activeStep ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <span className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                      activeStep ? "bg-primary text-primary-foreground" : complete ? "bg-emerald-500/15 text-emerald-600" : "bg-muted",
                    )}>
                      {complete && !activeStep ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold">{s.title}</span>
                      <span className="block truncate text-[11px] opacity-70">{s.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Config panel */}
        <div className="min-w-0">
          {step === 0 && <StepBasic values={values} set={set} />}
          {step === 1 && <StepPersonality values={values} set={set} />}
          {step === 2 && <StepInstructions values={values} set={set} />}
          {step === 3 && <StepKnowledge knowledge={knowledge} values={values} toggle={toggleKnowledge} />}
          {step === 4 && <StepTools tools={tools} values={values} toggle={toggleTool} />}
          {step === 5 && <StepWhatsApp phones={phones} values={values} set={set} />}
          {step === 6 && <StepTest agentId={values.id} agentName={values.name} aiStatus={aiStatus} />}
          {step === 7 && (
            <StepPublish
              values={values}
              checks={readyChecks}
              canPublish={canPublish}
              linkedPhone={linkedPhone}
              pending={pending}
              onPublish={() => setPublishOpen(true)}
              onSave={() => save()}
            />
          )}

          {/* Step footer */}
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
              <ArrowLeft /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} disabled={step === 0 && !readyChecks.name}>
                Continue <ArrowRight />
              </Button>
            ) : null}
          </div>

          {/* Mobile preview */}
          <details className="mt-4 rounded-2xl border border-border bg-card p-4 lg:hidden">
            <summary className="cursor-pointer text-sm font-semibold">Live preview</summary>
            <div className="mt-3">
              <PreviewCard name={values.name} avatar={values.avatar} goalLabel={goalLabel} status={values.status} agentId={values.id} />
            </div>
          </details>
        </div>

        {/* Preview column */}
        <aside className="hidden min-w-0 lg:block xl:sticky xl:top-20">
          <PreviewCard name={values.name} avatar={values.avatar} goalLabel={goalLabel} status={values.status} agentId={values.id} />
        </aside>
      </div>

      {/* Publish confirmation */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogTitle>Publish AI Employee?</DialogTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            <b className="text-foreground">{values.name || "This agent"}</b> will begin handling eligible WhatsApp
            conversations{linkedPhone ? <> on <b className="text-foreground">{linkedPhone.displayPhoneNumber}</b></> : " on any connected number"}.
            You can pause it anytime.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPublishOpen(false)}>
              Cancel
            </Button>
            <Button onClick={publish} loading={pending}>
              <Rocket /> Publish
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function isStepComplete(i: number, v: AgentEditorValue): boolean {
  switch (i) {
    case 0: return v.name.trim().length >= 2;
    case 1: return !!(v.personality || v.tone);
    case 2: return !!((v.businessDescription || "").trim() || (v.systemInstructions || "").trim());
    case 3: return v.knowledgeBaseIds.length > 0;
    case 4: return v.enabledTools.length > 0;
    case 5: return !!v.whatsappPhoneNumberId;
    case 6: return false;
    case 7: return v.status === "ACTIVE";
    default: return false;
  }
}

/* ---------- Steps ---------- */

function StepBasic({ values, set }: { values: AgentEditorValue; set: (k: keyof AgentEditorValue, v: unknown) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic information</CardTitle>
        <CardDescription>Who is this AI employee?</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Agent name (required)">
          <Input value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="Priya — Sales Agent" required maxLength={80} />
        </Field>
        <Field label="Avatar emoji">
          <Input value={values.avatar || ""} onChange={(e) => set("avatar", e.target.value)} placeholder="🤖" maxLength={8} />
        </Field>
        <Field label="Goal">
          <Select value={values.goal || "GENERAL_ASSISTANT"} onChange={(e) => set("goal", e.target.value)}>
            {AGENT_GOALS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Language">
          <Select value={values.language || "en"} onChange={(e) => set("language", e.target.value)}>
            {["en", "es", "hi", "ar", "fr", "pt", "de"].map((l) => (
              <option key={l} value={l}>{l.toUpperCase()}</option>
            ))}
          </Select>
        </Field>
        <Field label="Business name">
          <Input value={values.description || ""} onChange={(e) => set("description", e.target.value)} placeholder="Acme Dental Clinic" maxLength={120} />
        </Field>
        <Field label="Short description">
          <Input value={values.description || ""} onChange={(e) => set("description", e.target.value)} placeholder="Replies to appointment questions" maxLength={140} />
        </Field>
      </CardContent>
    </Card>
  );
}

function StepPersonality({ values, set }: { values: AgentEditorValue; set: (k: keyof AgentEditorValue, v: unknown) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Personality</CardTitle>
        <CardDescription>Pick a preset, then fine-tune the tone.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2.5 sm:grid-cols-2" role="group" aria-label="Personality presets">
          {PRESETS.map((p) => {
            const selected = values.tone === p.tone && values.personality === p.personality;
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  set("personality", p.personality);
                  set("tone", p.tone);
                }}
                aria-pressed={selected}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-all",
                  selected ? "border-primary bg-primary/[0.06] shadow-sm" : "border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/40",
                )}
              >
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  <p.icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {p.name} {selected && <Check className="h-3.5 w-3.5 text-primary" />}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{p.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tone">
            <Input value={values.tone || ""} onChange={(e) => set("tone", e.target.value)} placeholder="Friendly, professional" maxLength={80} />
          </Field>
          <Field label="Response style">
            <Input value={values.personality || ""} onChange={(e) => set("personality", e.target.value)} placeholder="Concise, warm, uses bullets" maxLength={160} />
          </Field>
        </div>
      </CardContent>
    </Card>
  );
}

function CountedTextarea({ value, onChange, placeholder, rows = 5 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <div>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} />
      <p className="mt-1 text-right text-[11px] tabular-nums text-muted-foreground" aria-live="polite">
        {value.length} characters
      </p>
    </div>
  );
}

function StepInstructions({ values, set }: { values: AgentEditorValue; set: (k: keyof AgentEditorValue, v: unknown) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Instructions & guardrails</CardTitle>
        <CardDescription>What the agent must do — and must never do.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Field label="Business description">
          <CountedTextarea value={values.businessDescription || ""} onChange={(v) => set("businessDescription", v)} placeholder="What does your business do? What do you sell, and where?" />
        </Field>
        <Field label="System instructions">
          <CountedTextarea value={values.systemInstructions || ""} onChange={(v) => set("systemInstructions", v)} placeholder="Always greet by name. Never invent prices — check knowledge first." />
        </Field>
        <Field label="Things the AI should do">
          <CountedTextarea value={values.rules || ""} onChange={(v) => set("rules", v)} placeholder="Qualify budget and timeline. Offer an appointment when interested." rows={4} />
        </Field>
        <Field label="Things the AI must never do">
          <CountedTextarea value={values.prohibitedActions || ""} onChange={(v) => set("prohibitedActions", v)} placeholder="Never promise discounts. Never share internal notes." rows={4} />
        </Field>
        <Field label="Escalation rules">
          <CountedTextarea value={values.escalationRules || ""} onChange={(v) => set("escalationRules", v)} placeholder="Transfer to a human when the customer asks for a person, or after 2 failed answers." rows={4} />
        </Field>
        <Field label="Fallback response">
          <CountedTextarea value={values.fallbackResponse || ""} onChange={(v) => set("fallbackResponse", v)} placeholder="I don't have that information yet — let me connect you with our team." rows={3} />
        </Field>
      </CardContent>
    </Card>
  );
}

function StepKnowledge({
  knowledge,
  values,
  toggle,
}: {
  knowledge: BuilderKnowledge[];
  values: AgentEditorValue;
  toggle: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Knowledge</CardTitle>
        <CardDescription>Approved sources the agent answers from. It never invents facts outside these.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2.5">
        {knowledge.length === 0 && (
          <div className="rounded-2xl border border-dashed p-6 text-center">
            <p className="text-sm font-semibold">No knowledge bases yet</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Create one first, then attach it here.</p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/knowledge">Open Knowledge Base</Link>
            </Button>
          </div>
        )}
        {knowledge.map((kb) => {
          const selected = values.knowledgeBaseIds.includes(kb.id);
          const ready = kb.documents.filter((d) => d.status === "READY").length;
          return (
            <button
              key={kb.id}
              type="button"
              onClick={() => toggle(kb.id)}
              aria-pressed={selected}
              className={cn(
                "flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all",
                selected ? "border-primary bg-primary/[0.06] shadow-sm" : "border-border hover:border-muted-foreground/30",
              )}
            >
              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                <Database className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{kb.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {kb.documents.length} document{kb.documents.length === 1 ? "" : "s"} · {ready} ready
                </span>
              </span>
              <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                {selected && <Check className="h-3 w-3" />}
              </span>
            </button>
          );
        })}
        <Button asChild variant="outline" size="sm" className="mt-1 w-fit">
          <Link href="/knowledge"><Database /> Manage knowledge</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function StepTools({
  tools,
  values,
  toggle,
}: {
  tools: BuilderTool[];
  values: AgentEditorValue;
  toggle: (name: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tools</CardTitle>
        <CardDescription>Only tools supported by the backend are listed. Disabled tools are never called.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2.5 sm:grid-cols-2">
        {tools.map((t) => {
          const enabled = values.enabledTools.includes(t.name);
          const Icon = TOOL_ICONS[t.name] || Wrench;
          return (
            <button
              key={t.name}
              type="button"
              onClick={() => toggle(t.name)}
              aria-pressed={enabled}
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-all",
                enabled ? "border-primary bg-primary/[0.06] shadow-sm" : "border-border hover:border-muted-foreground/30",
              )}
            >
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", enabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{TOOL_TITLES[t.name] || t.name.replaceAll("_", " ")}</span>
                <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">{t.description}</span>
              </span>
              <Checkbox checked={enabled} onChange={() => toggle(t.name)} onClick={(e) => e.stopPropagation()} aria-label={TOOL_TITLES[t.name] || t.name} />
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

function StepWhatsApp({
  phones,
  values,
  set,
}: {
  phones: BuilderPhone[];
  values: AgentEditorValue;
  set: (k: keyof AgentEditorValue, v: unknown) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>WhatsApp</CardTitle>
        <CardDescription>Which number should this employee answer on?</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2.5">
        {phones.length === 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-5 text-center">
            <Plug className="mx-auto h-6 w-6 text-amber-600" />
            <p className="mt-2 text-sm font-semibold">No WhatsApp number connected</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
              Connect a WhatsApp Business number first. Connection status is always live — never faked.
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link href="/integrations">Connect WhatsApp</Link>
            </Button>
          </div>
        )}
        {phones.map((p) => {
          const selected = values.whatsappPhoneNumberId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => set("whatsappPhoneNumberId", selected ? null : p.id)}
              aria-pressed={selected}
              className={cn(
                "flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all",
                selected ? "border-primary bg-primary/[0.06] shadow-sm" : "border-border hover:border-muted-foreground/30",
              )}
            >
              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                <Phone className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold tabular-nums">{p.displayPhoneNumber}</span>
                <span className="block truncate text-xs text-muted-foreground">{p.verifiedName || "WhatsApp Business number"}</span>
              </span>
              <Badge variant="success">Connected</Badge>
            </button>
          );
        })}
        {phones.length > 0 && (
          <button
            type="button"
            onClick={() => set("whatsappPhoneNumberId", null)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Use any available number
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function StepTest({
  agentId,
  agentName,
  aiStatus,
}: {
  agentId?: string;
  agentName: string;
  aiStatus?: { provider: string; model: string; connected: boolean };
}) {
  const statusLine = (
    <p className="text-xs text-muted-foreground">
      AI Provider: <span className="font-medium text-foreground">{aiStatus?.provider || "OpenRouter"}</span>
      {" · "}Model: <span className="font-mono">{aiStatus?.model || "…"}</span>
      {" · "}Connection: {aiStatus ? (aiStatus.connected ? "Connected" : "Not configured — set OPENROUTER_API_KEY on the server") : "…"}
    </p>
  );
  if (!agentId) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 p-8 text-center">
          <FlaskConical className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Save your agent first</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
            The live test chat calls the real configured AI provider and needs a saved agent{agentName ? ` (“${agentName}”)` : ""}.
          </p>
          <div className="mx-auto">{statusLine}</div>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      {statusLine}
      <AgentTester agentId={agentId} />
    </div>
  );
}

function StepPublish({
  values,
  checks,
  canPublish,
  linkedPhone,
  pending,
  onPublish,
  onSave,
}: {
  values: AgentEditorValue;
  checks: { name: boolean; instructions: boolean };
  canPublish: boolean;
  linkedPhone?: BuilderPhone;
  pending: boolean;
  onPublish: () => void;
  onSave: () => void;
}) {
  const rows = [
    { ok: checks.name, label: "Agent has a name", hint: values.name || "Missing — see Basic step" },
    { ok: checks.instructions, label: "Business info or system instructions", hint: checks.instructions ? "Agent knows how to behave" : "Missing — see Instructions step" },
    { ok: true, label: `Knowledge: ${values.knowledgeBaseIds.length} source${values.knowledgeBaseIds.length === 1 ? "" : "s"} attached`, hint: values.knowledgeBaseIds.length ? "Agent answers from approved sources" : "Optional — agent will escalate unknowns", optional: true },
    { ok: true, label: linkedPhone ? `WhatsApp: ${linkedPhone.displayPhoneNumber}` : "WhatsApp: any connected number", hint: "Publishing itself doesn't require a number", optional: true },
    { ok: true, label: `Tools: ${values.enabledTools.length} enabled`, hint: "Only enabled tools can be called", optional: true },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review & publish</CardTitle>
        <CardDescription>Publishing is a real backend operation — the agent starts handling conversations.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", r.ok && !r.optional ? "bg-emerald-500/15 text-emerald-600" : r.optional ? "bg-muted text-muted-foreground" : "bg-red-500/10 text-red-600")}>
              {r.ok ? <Check className="h-4 w-4" /> : <span className="text-xs font-bold">!</span>}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.label}</p>
              <p className="truncate text-xs text-muted-foreground">{r.hint}</p>
            </div>
          </div>
        ))}
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={onSave} disabled={pending} className="flex-1">
            Save draft
          </Button>
          <Button onClick={onPublish} disabled={!canPublish || pending} className="flex-1">
            <Rocket /> {values.status === "ACTIVE" ? "Republish" : "Publish AI Employee"}
          </Button>
        </div>
        {!canPublish && (
          <p className="text-xs text-muted-foreground">Add a name and instructions to unlock publishing.</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Preview ---------- */

function PreviewCard({
  name,
  avatar,
  goalLabel,
  status,
  agentId,
}: {
  name: string;
  avatar?: string | null;
  goalLabel: string;
  status?: string | null;
  agentId?: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl" aria-hidden>
          {avatar || <Bot className="h-5 w-5 text-primary" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold tracking-tight">{name || "Untitled agent"}</p>
          <p className="truncate text-xs text-muted-foreground">{goalLabel}</p>
        </div>
        {status && <AgentStatusBadge status={status as "DRAFT" | "TESTING" | "ACTIVE" | "PAUSED"} />}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="relative flex h-2 w-2">
          <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Live preview
      </div>
      {agentId ? (
        <AgentTester agentId={agentId} compact />
      ) : (
        <p className="rounded-xl bg-muted p-3 text-center text-xs text-muted-foreground">
          Save the agent to enable the live test chat here.
        </p>
      )}
    </div>
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
