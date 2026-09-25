import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  Bot,
  CalendarCheck2,
  CheckCircle2,
  Database,
  Inbox,
  MessagesSquare,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";

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

const ASSURANCES = [
  { icon: ShieldCheck, text: "Your data stays in your workspace" },
  { icon: Zap, text: "Replies in seconds, 24/7" },
  { icon: CheckCircle2, text: "Human takeover anytime" },
];

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-sm">
              <Bot className="h-4 w-4" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-bold tracking-tight">WhatsApp AI Employee</span>
              <span className="block text-[11px] text-muted-foreground">by Ops</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#how-it-works" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#inbox-preview" className="transition-colors hover:text-foreground">
              Inbox
            </a>
            <a href="#faq" className="transition-colors hover:text-foreground">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">
                Start Building <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-emerald-500/[0.08] via-transparent to-transparent" aria-hidden />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
            <div className="flex flex-col items-start gap-5 animate-page-in">
              <Badge variant="success">
                <Sparkles className="mr-1 h-3 w-3" /> WhatsApp Cloud API · AI employees
              </Badge>
              <h1 className="max-w-xl text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
                AI-powered WhatsApp automation for your business
              </h1>
              <p className="max-w-xl text-lg leading-8 text-muted-foreground">
                AI conversations, lead qualification, customer support, automation, human handoff,
                and knowledge-powered responses — all from one inbox.
              </p>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/register">
                    Start Building <ArrowRight />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <a href="#how-it-works">
                    <PlayCircle /> See How It Works
                  </a>
                </Button>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {ASSURANCES.map((a) => (
                  <p key={a.text} className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <a.icon className="h-4 w-4 text-emerald-600" /> {a.text}
                  </p>
                ))}
              </div>
            </div>

            <Card id="inbox-preview" className="card-elevated w-full scroll-mt-20 overflow-hidden animate-pop-in">
              <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Inbox className="h-4 w-4 text-muted-foreground" /> Shared inbox
                </p>
                <Badge variant="success">AI active</Badge>
              </div>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex justify-start animate-msg-in">
                  <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-muted px-3.5 py-2.5 text-sm shadow-sm">
                    Hi! Do you deliver to Koramangala? Need 20 office chairs by Friday.
                    <span className="mt-1 block text-[11px] text-muted-foreground">Customer · WhatsApp · 10:24</span>
                  </div>
                </div>
                <div className="flex justify-end animate-msg-in">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-[#d9fdd3] px-3.5 py-2.5 text-sm text-gray-900 shadow-sm">
                    Yes, we deliver across Bengaluru in 48 hours. For 20 chairs I can offer our
                    bulk rate — shall I book a quick call to confirm specs?
                    <span className="mt-1 block text-[11px] opacity-70">Sales agent · AI · 10:24 ✓✓</span>
                  </div>
                </div>
                <div className="flex justify-start animate-msg-in">
                  <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-muted px-3.5 py-2.5 text-sm shadow-sm">
                    Tomorrow 11am works.
                    <span className="mt-1 block text-[11px] text-muted-foreground">Customer · WhatsApp · 10:26</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground shadow-sm">
                  <CalendarCheck2 className="h-3.5 w-3.5 text-emerald-600" />
                  Appointment proposed · Lead qualified (score 82) · Teammate notified
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-16">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-emerald-600">Everything in one workspace</p>
              <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight">One inbox to run your WhatsApp operation</h2>
              <p className="mt-3 leading-7 text-muted-foreground">
                Agents answer, the inbox keeps humans in control, and leads, automations,
                and knowledge keep the whole system accurate.
              </p>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <Card key={f.title} className="card-elevated p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold tracking-tight">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{f.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-16 border-y border-border bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-emerald-600">How it works</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight">Live in three steps</h2>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {STEPS.map((s) => (
                <Card key={s.n} className="p-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-sm">
                    {s.n}
                  </span>
                  <h3 className="mt-4 text-base font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{s.description}</p>
                </Card>
              ))}
            </div>
            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg">
                <Link href="/register">
                  Start Building <ArrowRight />
                </Link>
              </Button>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MessagesSquare className="h-4 w-4" /> Replies in seconds, 24/7 — with human takeover anytime.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ — honest, no fake testimonials */}
        <section id="faq" className="scroll-mt-16">
          <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 md:py-24">
            <h2 className="text-3xl font-bold tracking-tight">Questions, answered honestly</h2>
            <div className="mt-6 flex flex-col gap-3">
              {[
                { q: "Do I need my own WhatsApp Business number?", a: "Yes. You connect your number via the WhatsApp Cloud API from the Integrations page. Connection status is always shown live — never faked." },
                { q: "Does the AI invent prices or availability?", a: "No. Agents answer from your knowledge base and tools. When information is missing, they say so and offer human help." },
                { q: "Can my team take over?", a: "Anytime. Pause AI per conversation, transfer, add internal notes (never sent to customers), resolve, or return to AI." },
                { q: "What do I need to get started?", a: "A workspace, a WhatsApp Business number (Meta), and optionally a Gemini API key for AI replies. PostgreSQL is the source of truth for all business data." },
              ].map((f) => (
                <Card key={f.q} className="p-5">
                  <p className="text-[15px] font-semibold">{f.q}</p>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{f.a}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-4 py-16 sm:px-6 md:py-24">
            <Badge variant="success"><Sparkles className="mr-1 h-3 w-3" /> Ready when you are</Badge>
            <h2 className="max-w-2xl text-balance text-3xl font-bold tracking-tight">
              Your customers are on WhatsApp. Meet them there.
            </h2>
            <p className="max-w-xl leading-7 text-muted-foreground">
              Set up your workspace, connect your number, and put your first AI employee to work.
            </p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button asChild size="lg">
                <Link href="/register">
                  Start Building <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/login">Log in</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-emerald-700 text-white">
              <Bot className="h-3.5 w-3.5" />
            </span>
            WhatsApp AI Employee — automation, inbox, leads & handoff
          </p>
          <p className="flex gap-4">
            <Link href="/login" className="hover:text-foreground">
              Log in
            </Link>
            <Link href="/register" className="hover:text-foreground">
              Start Building
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
