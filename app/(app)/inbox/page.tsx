import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireSessionOrRedirect } from "@/app/actions/session";
import { countConversations, listConversations, INBOX_PAGE_SIZE, type InboxFilter } from "@/services/inbox/conversation.service";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/badge";
import { ConversationStatusBadge } from "@/components/status-badges";
import { Pagination } from "@/components/ui/stat";
import { ListSkeleton } from "@/components/ui/skeletons";
import { InboxSearch } from "@/components/inbox/search";
import { relTime } from "@/components/format";
import { cn } from "@/lib/utils";
import { Inbox as InboxIcon } from "lucide-react";

export const metadata: Metadata = { title: "Inbox" };

const FILTERS: { value: InboxFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "ai", label: "AI handled" },
  { value: "human", label: "Human" },
  { value: "assigned", label: "Mine" },
  { value: "leads", label: "Leads" },
  { value: "priority", label: "Priority" },
];

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSessionOrRedirect();
  const orgId = session.user.organizationId!;
  const sp = await searchParams;
  const filterParam = typeof sp.filter === "string" ? sp.filter : "all";
  const filter = (FILTERS.some((f) => f.value === filterParam) ? filterParam : "all") as InboxFilter;
  const query = typeof sp.q === "string" ? sp.q.trim() || undefined : undefined;
  const page = Math.max(1, parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <PageHeader
        title="Inbox"
        description="Every WhatsApp conversation, with AI and human ownership."
        actions={<InboxSearch initial={query || ""} />}
      />

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Conversation filters">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          const href = `/inbox?filter=${f.value}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
          return (
            <Link
              key={f.value}
              href={href}
              prefetch
              role="tab"
              aria-selected={active}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card border border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <Suspense fallback={<ListSkeleton rows={6} />}>
        <ConversationList orgId={orgId} userId={session.user.id!} filter={filter} query={query} page={page} />
      </Suspense>
    </div>
  );
}

async function ConversationList({
  orgId,
  userId,
  filter,
  query,
  page,
}: {
  orgId: string;
  userId: string;
  filter: InboxFilter;
  query?: string;
  page: number;
}) {
  const [conversations, total] = await Promise.all([
    listConversations(orgId, userId, filter, query, page),
    countConversations(orgId, userId, filter, query),
  ]);
  const hasMore = page * INBOX_PAGE_SIZE < total;
  const baseHref = `/inbox?filter=${filter}${query ? `&q=${encodeURIComponent(query)}` : ""}`;

  if (!conversations.length) {
    return (
      <EmptyState
        icon={InboxIcon}
        title={query ? `No results for “${query}”` : "No conversations"}
        description={
          query
            ? "Try a different name or phone number, or clear the search."
            : "No conversations match this view. Messages from your WhatsApp customers appear here."
        }
        action={
          query ? (
            <Link href="/inbox" className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted">
              Clear search
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      <p className="text-xs text-muted-foreground" role="status">
        Showing {(page - 1) * INBOX_PAGE_SIZE + 1}–{(page - 1) * INBOX_PAGE_SIZE + conversations.length} of {total}
        {query ? ` for “${query}”` : ""}
      </p>
      <div className="flex flex-col gap-2">
        {conversations.map((c) => {
          const last = c.messages[0];
          return (
            <Link key={c.id} href={`/inbox/${c.id}`} prefetch>
              <Card className="card-elevated flex items-center gap-3 p-4">
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    c.unreadCount > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {(c.contact.name || c.contact.phone || "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">
                      {c.contact.name || c.contact.phone}
                      {c.unreadCount > 0 ? (
                        <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                          {c.unreadCount}
                        </span>
                      ) : null}
                    </p>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{relTime(c.lastMessageAt)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] text-muted-foreground">{last?.content || "No messages yet"}</p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {c.priority !== "NORMAL" ? <Badge variant="warning">{c.priority}</Badge> : null}
                      <ConversationStatusBadge status={c.status} />
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      {(page > 1 || hasMore) && <Pagination page={page} hasMore={hasMore} baseHref={baseHref} />}
    </>
  );
}
