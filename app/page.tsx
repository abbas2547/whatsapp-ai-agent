import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ArrowRight,
  Bot,
  CalendarCheck2,
  ChartNoAxesCombined,
  Database,
  Inbox,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Workflow,
  Zap,
  CheckCircle2,
} from "lucide-react";
import { Hero3D, HeroCopy } from "@/components/home/hero-3d";
import { Reveal } from "@/components/home/reveal";
import { Faq } from "@/components/home/faq";
import { Logo, FooterBrand } from "@/components/home/logo";

const FEATURES = [
  {
    icon: Bot,
    title: "AI Agents",
    description: "AI employees that reply instantly, qualify customers, and hand off to your team when needed.",
  },
  {
    icon: Inbox,
    title: "Shared Inbox",
    description: "Every WhatsApp conversation in one place, with AI/human status and assignment.",
  },
  {
    icon: Users,
    title: "Leads & CRM",
    description: "Opportunities captured automatically from conversations, scored and pipeline-ready.",
  },
  {
    icon: Workflow,
    title: "Automations",
    description: "Triggers, conditions, follow-ups, and WhatsApp actions that run on autopilot.",
  },
  {
    icon: Database,
    title: "Knowledge",
    description: "Approved answers from your docs and FAQs, so agents never invent facts.",
  },
  {
    icon: CalendarCheck2,
    title: "Calendar",
    description: "Agents check availability and book appointments straight into your calendar.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Connect WhatsApp",
    description: "Link your WhatsApp Business number via the Cloud API. Your webhook is configured for you.",
  },
  {
    n: "2",
    title: "Train your agent",
    description: "Give it your business info, tone, rules, and knowledge base. Test it before it goes live.",
  },
  {
    n: "3",
    title: "Run on autopilot",
    description: "The agent replies, qualifies, books, and follows up. Your team steps in from the shared inbox.",
  },
];

const FAQS = [
  { q: "Do I need my own WhatsApp Business number?", a: "Yes. You connect your number via the WhatsApp Cloud API from the Integrations page. Connection status is always shown live — never faked." },
  { q: "Does the AI invent prices or availability?", a: "No. Agents answer from your knowledge base and tools. When information is missing, they say so and offer human help." },
  { q: "Can my team take over?", a: "Anytime. Pause AI per conversation, transfer, add internal notes (never sent to customers), resolve, or return to AI." },
  { q: "What do I need to get started?", a: "A workspace, a WhatsApp Business number (Meta), and an OpenRouter API key for AI replies. PostgreSQL is the source of truth for all business data." },
];

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#product" className="transition-colors hover:text-foreground">Product</a>
            <a href="#how-it-works" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#inbox-preview" className="transition-colors hover:text-foreground">Inbox</a>
            <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild size="sm" className="shadow-md shadow-emerald-600/20">
              <Link href="/register">
                Start Building <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero — 3D interactive */}
        <section className="hero-grid relative overflow-hidden border-b border-border">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-emerald-500/[0.09] via-transparent to-transparent" aria-hidden />
          <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-emerald-400/20 blur-3xl animate-blob" aria-hidden />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,430px)]">
            <HeroCopy />
            <div id="inbox-preview" className="scroll-mt-24">
              <Hero3D />
            </div>
          </div>
          {/* trust strip */}
          <div className="relative border-t border-border/70 bg-muted/30">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 py-3 text-[13px] text-muted-foreground sm:px-6">
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Your data stays in your workspace</span>
              <span className="flex items-center gap-1.5"><Zap className="h-4 w-4 text-emerald-600" /> Replies in seconds, 24/7</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Human takeover anytime</span>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="border-b border-border">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-3 px-4 py-8 sm:px-6 md:grid-cols-4">
            {[
              { k: "4s", v: "Median AI reply time" },
              { k: "24/7", v: "Always-on coverage" },
              { k: "6+", v: "Tools per agent" },
              { k: "3 steps", v: "To go live" },
            ].map((s, i) => (
              <Reveal key={s.v} delay={i * 0.06}>
                <div className="glass rounded-2xl px-4 py-4 text-center transition-transform duration-300 hover:-translate-y-1">
                  <p className="text-gradient text-2xl font-extrabold">{s.k}</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">{s.v}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-16">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
            <Reveal>
              <p className="text-sm font-semibold text-emerald-600">Everything in one workspace</p>
              <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight">One inbox to run your WhatsApp operation</h2>
              <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
                Agents answer, the inbox keeps humans in control, and leads, automations,
                and knowledge keep the whole system accurate.
              </p>
            </Reveal>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 [perspective:1200px]">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={(i % 3) * 0.07}>
                  <Card className="card-tilt group h-full p-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/15 to-teal-500/10 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
                      <f.icon className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
                    </div>
                    <h3 className="mt-4 text-base font-semibold tracking-tight">{f.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{f.description}</p>
                  </Card>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Product tour */}
        <section id="product" className="scroll-mt-16 border-y border-border bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
            <Reveal>
              <p className="text-sm font-semibold text-emerald-600">Product tour</p>
              <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight">Everything a WhatsApp operation needs</h2>
            </Reveal>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {[
                { icon: Bot, title: "AI Employee builder", desc: "Guided 8-step builder: basic info, personality presets, instructions, knowledge, tools, WhatsApp number, live test chat, publish. Save drafts, preview live, publish for real." },
                { icon: Users, title: "Lead qualification", desc: "Agents collect budget, timeline and intent naturally. Leads land in a table or a drag-and-drop pipeline that writes straight to the database." },
                { icon: Database, title: "Knowledge-powered answers", desc: "Upload PDFs, DOCX and FAQs. Documents move through uploading, processing and ready states — agents never invent facts outside them." },
                { icon: Workflow, title: "Visual automations", desc: "Triggers, conditions, AI steps, WhatsApp messages, waits and handoffs on a zoomable canvas — with a real execution timeline per run." },
                { icon: UserPlus, title: "Human handoff", desc: "AI_ACTIVE, WAITING_FOR_HUMAN, HUMAN_ACTIVE, RESOLVED. Take over, return to AI, or resolve — internal notes never reach the customer." },
                { icon: ChartNoAxesCombined, title: "Analytics & integrations", desc: "Real message volume, AI-vs-human split, pipeline and automation activity over 7/30/90 days. WhatsApp, Google Calendar, Gmail and HTTP integrations." },
              ].map((s, i) => (
                <Reveal key={s.title} delay={(i % 2) * 0.08}>
                  <Card className="card-tilt h-full p-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/15 to-teal-500/10">
                      <s.icon className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
                    </div>
                    <h3 className="mt-4 text-base font-semibold tracking-tight">{s.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{s.desc}</p>
                  </Card>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-16">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
            <Reveal>
              <p className="text-sm font-semibold text-emerald-600">How it works</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight">Live in three steps</h2>
            </Reveal>
            <div className="relative mt-8 grid gap-4 md:grid-cols-3">
              <div aria-hidden className="absolute left-0 right-0 top-8 hidden h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent md:block" />
              {STEPS.map((s, i) => (
                <Reveal key={s.n} delay={i * 0.1}>
                  <Card className="card-tilt relative p-6">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 text-sm font-bold text-white shadow-md shadow-emerald-600/30">
                      {s.n}
                    </span>
                    <h3 className="mt-4 text-base font-semibold tracking-tight">{s.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{s.description}</p>
                  </Card>
                </Reveal>
              ))}
            </div>
            <Reveal delay={0.1}>
              <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <Button asChild size="lg" className="btn-magnetic shadow-lg shadow-emerald-600/20">
                  <Link href="/register">
                    Start Building <ArrowRight />
                  </Link>
                </Button>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MessagesSquare className="h-4 w-4" /> Replies in seconds, 24/7 — with human takeover anytime.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-16 border-t border-border bg-muted/30">
          <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 md:py-24">
            <Reveal>
              <h2 className="text-3xl font-bold tracking-tight">Questions, answered honestly</h2>
              <p className="mt-2 text-sm text-muted-foreground">No fake testimonials. Just how it works.</p>
            </Reveal>
            <Reveal delay={0.1} className="mt-6">
              <Faq items={FAQS} />
            </Reveal>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative overflow-hidden border-t border-border">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/[0.12] via-teal-500/[0.06] to-transparent" />
          <div aria-hidden className="pointer-events-none absolute -bottom-20 left-1/4 h-56 w-96 rounded-full bg-emerald-400/20 blur-3xl animate-blob" />
          <div className="relative mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-4 py-16 sm:px-6 md:py-24">
            <Reveal>
              <Badge variant="success"><Sparkles className="mr-1 h-3 w-3" /> Ready when you are</Badge>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="max-w-2xl text-balance text-3xl font-bold tracking-tight">
                Your customers are on WhatsApp. <span className="text-gradient">Meet them there.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="max-w-xl leading-7 text-muted-foreground">
                Set up your workspace, connect your number, and put your first AI employee to work.
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Button asChild size="lg" className="btn-magnetic shadow-lg shadow-emerald-600/25">
                  <Link href="/register">
                    Start Building <ArrowRight />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/login">Log in</Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <FooterBrand />
          <p className="flex gap-4">
            <Link href="/login" className="hover:text-foreground">Log in</Link>
            <Link href="/register" className="hover:text-foreground">Start Building</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
