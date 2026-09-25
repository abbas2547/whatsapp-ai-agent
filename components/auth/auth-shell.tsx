import Link from "next/link";
import { Bot, Inbox, Sparkles, Users, CalendarCheck2 } from "lucide-react";

const HIGHLIGHTS = [
  { icon: Sparkles, text: "AI agents reply to customers in seconds, 24/7" },
  { icon: Inbox, text: "Every conversation in one shared inbox" },
  { icon: Users, text: "Leads qualified and scored automatically" },
  { icon: CalendarCheck2, text: "Appointments booked straight into your calendar" },
];

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-full flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-zinc-900 text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          aria-hidden
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <Link href="/" className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
            <Bot className="h-5 w-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-bold tracking-tight">WhatsApp AI Employee</span>
            <span className="block text-xs text-emerald-200/80">AI automation for WhatsApp Business</span>
          </span>
        </Link>

        <div className="relative">
          <h2 className="max-w-md text-balance text-3xl font-bold leading-tight tracking-tight">
            Put your WhatsApp on autopilot.
          </h2>
          <ul className="mt-6 flex flex-col gap-3.5">
            {HIGHLIGHTS.map((h) => (
              <li key={h.text} className="flex items-center gap-3 text-[14px] text-emerald-50/90">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10">
                  <h.icon className="h-4 w-4" />
                </span>
                {h.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-emerald-200/60">
          Your data stays in your own workspace · Human takeover anytime
        </p>
      </div>

      {/* Form column */}
      <div className="flex items-center justify-center bg-background px-4 py-12 sm:px-8">
        <div className="w-full max-w-md animate-page-in">
          <Link href="/" className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-sm">
              <Bot className="h-4 w-4" />
            </span>
            <span className="text-sm font-bold tracking-tight">WhatsApp AI Employee</span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
