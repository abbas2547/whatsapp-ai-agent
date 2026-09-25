import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireSessionOrRedirect } from "@/app/actions";
import { countLeads, listLeads, LEADS_PAGE_SIZE } from "@/services/leads/lead.service";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/badge";
import { LeadStatusSelect } from "@/components/leads/lead-actions";
import { LeadStatusBadge } from "@/components/status-badges";
import { Pagination } from "@/components/ui/stat";
import { TableSkeleton } from "@/components/ui/skeletons";
import { fmtDate } from "@/components/format";
import type { LeadStatus } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Crosshair, Table2, KanbanSquare } from "lucide-react";

export const metadata: Metadata = { title: "Leads" };

const STATUSES: { value?: LeadStatus; label: string }[] = [
  { label: "All" },
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "PROPOSAL", label: "Proposal" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSessionOrRedirect();
  const orgId = session.user.organizationId!;
  const sp = await searchParams;
  const statusParam = typeof sp.status === "string" ? sp.status : undefined;
  const status = STATUSES.some((s) => s.value === statusParam) ? (statusParam as LeadStatus) : undefined;
  const page = Math.max(1, parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const view = sp.view === "pipeline" ? "pipeline" : "table";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <PageHeader
        title="Leads"
        description="Opportunities captured from your WhatsApp conversations."
        actions={
          <div className="flex rounded-xl border border-border bg-card p-1 text-xs font-semibold" role="tablist" aria-label="View">
            <Link
              href={`/leads${status ? `?status=${status}` : ""}`}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5", view === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              role="tab"
              aria-selected={view === "table"}
            >
              <Table2 className="h-3.5 w-3.5" /> Table
            </Link>
            <Link
              href={`/leads?view=pipeline${status ? `&status=${status}` : ""}`}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5", view === "pipeline" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              role="tab"
              aria-selected={view === "pipeline"}
            >
              <KanbanSquare className="h-3.5 w-3.5" /> Pipeline
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Lead status">
        {STATUSES.map((s) => {
          const active = status === s.value;
          const href = `/leads${s.value ? `?status=${s.value}` : ""}${view === "pipeline" ? `${s.value ? "&" : "?"}view=pipeline` : ""}`;
          return (
            <Link
              key={s.label}
              href={href}
              prefetch
              role="tab"
              aria-selected={active}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all",
                active ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      <Suspense fallback={<TableSkeleton rows={4} />}>
        <LeadList orgId={orgId} status={status} page={page} view={view} />
      </Suspense>
    </div>
  );
}

async function LeadList({ orgId, status, page, view }: { orgId: string; status?: LeadStatus; page: number; view: string }) {
  const [leads, total] = await Promise.all([listLeads(orgId, status, page), countLeads(orgId, status)]);
  const hasMore = page * LEADS_PAGE_SIZE < total;
  const base = `/leads${status ? `?status=${status}` : ""}${view === "pipeline" ? `${status ? "&" : "?"}view=pipeline` : ""}`;

  if (!leads.length) {
    return (
      <EmptyState
        icon={Crosshair}
        title="No leads"
        description="Leads are created automatically when your AI agents qualify a customer, or when automations create them."
      />
    );
  }

  if (view === "pipeline") {
    const cols: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"];
    const grouped = new Map<LeadStatus, typeof leads>();
    for (const c of cols) grouped.set(c, []);
    for (const l of leads) grouped.get(l.status)?.push(l);
    // When a status filter is active, show only that column plus neighbors honestly.
    const visible = status ? [status] : cols;
    return (
      <>
        <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-3 xl:grid-cols-6" style={{ minWidth: 0 }}>
          {visible.map((col) => (
            <div key={col} className="min-w-60 rounded-2xl border border-border bg-muted/40 p-2.5">
              <p className="flex items-center justify-between px-1.5 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {col} <Badge variant="secondary">{status ? leads.length : grouped.get(col)?.length || 0}</Badge>
              </p>
              <div className="flex flex-col gap-2">
                {(status ? leads : grouped.get(col) || []).map((lead) => (
                  <Card key={lead.id} className="p-3">
                    <p className="truncate text-[13px] font-semibold">{lead.name || lead.contact?.name || lead.phone}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{lead.service || "No service"} · {lead.score}</p>
                    <div className="mt-2"><LeadStatusBadge status={lead.status} /></div>
                  </Card>
                ))}
                {(status ? leads : grouped.get(col) || []).length === 0 && (
                  <p className="px-1.5 py-4 text-center text-[11px] text-muted-foreground">No leads</p>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground" role="status">Showing {leads.length} of {total} lead(s).</p>
      </>
    );
  }

  return (
    <>
      <p className="text-xs text-muted-foreground" role="status">
        Showing {(page - 1) * LEADS_PAGE_SIZE + 1}–{(page - 1) * LEADS_PAGE_SIZE + leads.length} of {total} lead(s).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {leads.map((lead) => (
          <Card key={lead.id} className="card-elevated p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-[11px] font-bold text-sky-600">
                  {(lead.name || lead.contact?.name || lead.phone || "?").slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{lead.name || lead.contact?.name || lead.phone}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {lead.service || "No service"} {lead.company ? `· ${lead.company}` : ""}
                  </p>
                </div>
              </div>
              <LeadStatusBadge status={lead.status} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
              <span>Score: <b className="text-foreground">{lead.score}</b></span>
              <span>Source: {lead.source || "—"}</span>
              <span>Budget: {lead.budget || "—"}</span>
              <span>Timeline: {lead.timeline || "—"}</span>
              <span>Created: {fmtDate(lead.createdAt)}</span>
              <span>Assigned: {lead.assignedUser?.name || "—"}</span>
            </div>
            {lead.intent ? (
              <p className="mt-2 rounded-xl bg-muted p-2.5 text-xs leading-5 text-muted-foreground">{lead.intent}</p>
            ) : null}
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground">Status</p>
              <LeadStatusSelect leadId={lead.id} status={lead.status} />
            </div>
          </Card>
        ))}
      </div>
      {(page > 1 || hasMore) && <Pagination page={page} hasMore={hasMore} baseHref={base} />}
    </>
  );
}
