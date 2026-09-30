"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  Bell,
  CreditCard,
  Database,
  HeartPulse,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Phone,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Briefcase,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LiveBadge } from "@/components/admin/live-badge";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/workspaces", label: "Workspaces", icon: Briefcase },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/admin/payments", label: "Payments", icon: Zap },
  { href: "/admin/whatsapp", label: "WhatsApp", icon: Phone },
  { href: "/admin/agents", label: "AI Agents", icon: Sparkles },
  { href: "/admin/conversations", label: "Conversations", icon: MessageSquare },
  { href: "/admin/leads", label: "Leads", icon: Activity },
  { href: "/admin/automations", label: "Automations", icon: Workflow },
  { href: "/admin/knowledge", label: "Knowledge", icon: Database },
  { href: "/admin/analytics", label: "Analytics", icon: Activity },
  { href: "/admin/sessions", label: "Sessions", icon: ShieldCheck },
  { href: "/admin/system", label: "System Health", icon: HeartPulse },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminShell({
  adminName,
  adminEmail,
  children,
}: {
  adminName: string | null;
  adminEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const initial = (adminName || adminEmail || "A").slice(0, 1).toUpperCase();

  const nav = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Admin">
      {NAV.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors",
              active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-border bg-card md:flex" aria-label="Admin primary">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">E</span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13.5px] font-bold">Eluue Admin</p>
            <p className="truncate text-[11px] text-muted-foreground">Operations console</p>
          </div>
        </div>
        {nav}
        <div className="border-t border-border p-3">
          <Link href="/dashboard" className="block rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
            ← Back to workspace
          </Link>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <div className="absolute inset-0 bg-black/45" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-[280px] flex-col bg-card shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <p className="text-sm font-bold">Eluue Admin</p>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-2 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
          <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
            <button onClick={() => setOpen(true)} aria-label="Open admin navigation" className="rounded-lg p-2 hover:bg-muted md:hidden">
              <Menu className="h-4 w-4" />
            </button>
            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold md:hidden">Eluue Admin</p>
            <div className="hidden min-w-0 flex-1 md:block" />
            <LiveBadge />
            <Link href="/admin/audit-logs" aria-label="Admin notifications" className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground">
              <Bell className="h-4 w-4" />
            </Link>
            <span className="flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-2.5" title={adminEmail}>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{initial}</span>
              <span className="hidden max-w-[160px] truncate text-xs font-semibold sm:block">{adminName || adminEmail}</span>
            </span>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 md:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
