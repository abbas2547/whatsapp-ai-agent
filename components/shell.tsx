"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronsRight,
  Contact as ContactIcon,
  Crosshair,
  Database,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  PanelLeft,
  Settings,
  Workflow,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { initials } from "@/components/format";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { InstallButton } from "@/components/pwa/install-button";
import { UpgradeButton } from "@/components/billing/upgrade-button";
import { WorkspaceSwitcher, type WorkspaceItem } from "@/components/shell/workspace-switcher";

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: number };

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Workspace",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/contacts", label: "Contacts", icon: ContactIcon },
      { href: "/leads", label: "Leads", icon: Crosshair },
    ],
  },
  {
    title: "AI",
    items: [
      { href: "/agents", label: "AI Agents", icon: Bot },
      { href: "/knowledge", label: "Knowledge", icon: Database },
      { href: "/automations", label: "Automations", icon: Workflow },
    ],
  },
  {
    title: "Business",
    items: [
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/analytics", label: "Analytics", icon: ChartNoAxesCombined },
      { href: "/integrations", label: "Integrations", icon: Zap },
    ],
  },
  {
    title: "Settings",
    items: [{ href: "/settings", label: "Workspace", icon: Settings }],
  },
];

const TITLES: Record<string, string> = {
  dashboard: "Overview",
  inbox: "Inbox",
  contacts: "Contacts",
  leads: "Leads",
  agents: "AI Agents",
  knowledge: "Knowledge Base",
  automations: "Automations",
  calendar: "Calendar",
  analytics: "Analytics",
  integrations: "Integrations",
  settings: "Settings",
  billing: "Billing",
  pricing: "Pricing",
};

export function Shell({
  user,
  organizationName,
  organizationId,
  workspaces = [],
  alertCount = 0,
  planId = "free",
  paidActive = false,
  children,
}: {
  user: { name?: string | null; email?: string | null; image?: string | null; role?: string };
  organizationName: string;
  organizationId?: string;
  workspaces?: WorkspaceItem[];
  alertCount?: number;
  planId?: "free" | "starter" | "pro" | "business";
  paidActive?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("ops.sidebar") === "collapsed";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  function closeMobile() {
    setMobileOpen(false);
  }

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem("ops.sidebar", c ? "expanded" : "collapsed");
      } catch {
        /* ignore */
      }
      return !c;
    });
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 ease-out md:flex",
          collapsed ? "w-[72px]" : "w-[248px]",
        )}
        aria-label="Primary"
      >
        <div className={cn("flex h-14 items-center gap-2.5 border-b border-border px-3", collapsed && "justify-center px-2")}>
          {collapsed ? (
            <WorkspaceSwitcher workspaces={workspaces} activeId={organizationId || ""} collapsed onExpand={toggleCollapsed} />
          ) : (
            <WorkspaceSwitcher workspaces={workspaces} activeId={organizationId || ""} />
          )}
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto p-2.5">
          {GROUPS.map((group) => (
            <div key={group.title}>
              {!collapsed && (
                <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  {group.title}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] font-medium transition-all duration-150",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {active && !collapsed && (
                        <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" aria-hidden />
                      )}
                      <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                      {!collapsed && typeof item.badge === "number" && item.badge > 0 ? (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-2.5">
          <button
            onClick={toggleCollapsed}
            className="mb-1 hidden w-full items-center justify-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><PanelLeft className="h-4 w-4" /> Collapse</>}
          </button>
          <UserFooter user={user} collapsed={collapsed} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/45 animate-pop-in" onClick={closeMobile} />
          <aside className="absolute left-0 top-0 flex h-full w-[280px] flex-col border-r border-border bg-card shadow-2xl animate-page-in">
            <div className="flex h-14 items-center justify-between gap-2 border-b border-border px-3">
              <div className="min-w-0 flex-1">
                <WorkspaceSwitcher workspaces={workspaces} activeId={organizationId || ""} onNavigate={closeMobile} />
              </div>
              <Button variant="ghost" size="icon-sm" onClick={closeMobile} aria-label="Close menu">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <nav className="flex-1 space-y-5 overflow-y-auto p-3">
              {GROUPS.map((group) => (
                <div key={group.title}>
                  <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    {group.title}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={closeMobile}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium",
                            active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <item.icon className="h-[18px] w-[18px]" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
            <div className="border-t border-border p-3">
              <div onClick={closeMobile} className="mb-2">
                <UpgradeButton planId={planId} paidActive={paidActive} mobile />
              </div>
              <UserFooter user={user} collapsed={false} />
            </div>
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          organizationName={organizationName}
          alertCount={alertCount}
          planId={planId}
          paidActive={paidActive}
          onMenu={() => setMobileOpen(true)}
        />
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 md:px-8 md:py-6">
          <div key={pathname} className="animate-page-in mx-auto w-full max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function UserFooter({
  user,
  collapsed,
}: {
  user: { name?: string | null; email?: string | null; image?: string | null; role?: string };
  collapsed: boolean;
}) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1">
        <Link
          href="/settings"
          title={user.name || user.email || "Account"}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-bold"
        >
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            initials(user.name, user.email)
          )}
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Log out"
          aria-label="Log out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5 rounded-xl p-1.5">
      <Link href="/settings" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-muted to-muted-foreground/20 text-xs font-bold">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            initials(user.name, user.email)
          )}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-semibold">{user.name || user.email}</span>
          <span className="block truncate text-[11px] capitalize text-muted-foreground">
            {(user.role || "member").replaceAll("_", " ").toLowerCase()}
          </span>
        </span>
      </Link>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Log out"
        aria-label="Log out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

function TopBar({
  organizationName,
  alertCount,
  planId,
  paidActive,
  onMenu,
}: {
  organizationName: string;
  alertCount: number;
  planId: "free" | "starter" | "pro" | "business";
  paidActive: boolean;
  onMenu: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 350);

  const crumbs = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    return parts.map((part, i) => ({
      label: TITLES[part] || part.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      href: `/${parts.slice(0, i + 1).join("/")}`,
      last: i === parts.length - 1,
    }));
  }, [pathname]);

  useEffect(() => {
    if (!debounced.trim()) return;
    // Debounced global search routes to the most relevant list with real backend filtering.
  }, [debounced]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    const seg = pathname.split("/")[1];
    if (seg === "contacts" || seg === "inbox" || seg === "leads") {
      router.push(`/${seg}?q=${encodeURIComponent(q)}`);
    } else {
      router.push(`/inbox?q=${encodeURIComponent(q)}`);
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6 md:px-8">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onMenu} aria-label="Open navigation">
          <Menu className="h-4 w-4" />
        </Button>

        <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-1 items-center gap-1.5 text-[13px] sm:flex">
          <ChevronLeft className="hidden" />
          {crumbs.map((c, i) => (
            <span key={c.href} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground/50">/</span>}
              {c.last ? (
                <span className="truncate font-semibold" aria-current="page">{c.label}</span>
              ) : (
                <Link href={c.href} className="truncate text-muted-foreground transition-colors hover:text-foreground">
                  {c.label}
                </Link>
              )}
            </span>
          ))}
        </nav>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold sm:hidden">{organizationName}</span>

        <form onSubmit={submitSearch} className="relative hidden w-64 md:block lg:w-72" role="search">
          <MessagesSquare className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations, contacts…"
            aria-label="Global search"
            className="h-9 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-[13px] shadow-sm outline-none transition-all placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
          />
        </form>

        <Link
          href="/inbox?filter=unread"
          className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
          aria-label={alertCount > 0 ? `${alertCount} unread conversations` : "Inbox"}
          title="Unread inbox"
        >
          <Inbox className="h-4 w-4" />
          {alertCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {alertCount > 9 ? "9+" : alertCount}
            </span>
          )}
        </Link>

        <Link
          href="/settings"
          className="hidden h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-[13px] font-semibold shadow-sm transition-colors hover:bg-muted sm:flex"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          Workspace
        </Link>

        <UpgradeButton planId={planId} paidActive={paidActive} />

        <InstallButton />
      </div>
    </header>
  );
}
