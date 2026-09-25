import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireSessionOrRedirect } from "@/app/actions";
import { countContacts, listContacts, CONTACTS_PAGE_SIZE } from "@/services/contacts/contact.service";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/stat";
import { ListSkeleton } from "@/components/ui/skeletons";
import { DebouncedSearch } from "@/components/ui/debounced-search";
import { ImportContactsDialog } from "@/components/contacts/import-dialog";
import { fmtDate } from "@/components/format";
import { cn } from "@/lib/utils";
import { Users, Import, UserPlus } from "lucide-react";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSessionOrRedirect();
  const orgId = session.user.organizationId!;
  const sp = await searchParams;
  const query = typeof sp.q === "string" && sp.q.trim() ? sp.q.trim() : undefined;
  const tag = typeof sp.tag === "string" && sp.tag.trim() ? sp.tag.trim() : undefined;
  const page = Math.max(1, parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);

  const tags = await db.tag.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 30,
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <PageHeader
        title="Contacts"
        description="People who message your WhatsApp numbers."
        actions={
          <>
            <ImportContactsDialog />
            <Button asChild variant="outline" size="sm">
              <a href="/api/contacts/export">
                <Import /> Export CSV
              </a>
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <DebouncedSearch placeholder="Search name, phone, email…" initial={query || ""} className="min-w-52 flex-1 sm:max-w-xs" />
        <div className="flex flex-wrap items-center gap-1.5">
          {tag ? (
            <Link href="/contacts" className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
              tag: {tag} ✕
            </Link>
          ) : null}
          {tags.slice(0, 8).map((t) => (
            <Link
              key={t.id}
              href={`/contacts?tag=${encodeURIComponent(t.name)}`}
              prefetch
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                tag === t.name
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t.name}
            </Link>
          ))}
        </div>
      </div>

      <Suspense fallback={<ListSkeleton rows={6} />}>
        <ContactList orgId={orgId} query={query} tag={tag} page={page} />
      </Suspense>
    </div>
  );
}

async function ContactList({ orgId, query, tag, page }: { orgId: string; query?: string; tag?: string; page: number }) {
  const [contacts, total] = await Promise.all([
    listContacts(orgId, query, tag, page),
    countContacts(orgId, query, tag),
  ]);
  const hasMore = page * CONTACTS_PAGE_SIZE < total;
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (tag) params.set("tag", tag);
  const baseHref = `/contacts${params.toString() ? `?${params.toString()}` : ""}`;

  if (!contacts.length) {
    return (
      <EmptyState
        icon={query || tag ? Users : UserPlus}
        title={query ? `No contacts for “${query}”` : "No contacts"}
        description={
          query || tag
            ? "Try a different search or clear the filters."
            : "Contacts appear automatically when customers message you, or import a CSV to get started."
        }
        action={
          query || tag ? (
            <Button asChild variant="outline" size="sm"><Link href="/contacts">Clear filters</Link></Button>
          ) : (
            <ImportContactsDialog />
          )
        }
      />
    );
  }

  return (
    <>
      <p className="text-xs text-muted-foreground" role="status">
        Showing {(page - 1) * CONTACTS_PAGE_SIZE + 1}–{(page - 1) * CONTACTS_PAGE_SIZE + contacts.length} of {total}
      </p>
      <div className="flex flex-col gap-2">
        {contacts.map((c) => (
          <Link key={c.id} href={`/contacts/${c.id}`} prefetch>
            <Card className="card-elevated flex items-center gap-3 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-accent/40 text-xs font-bold text-primary">
                {(c.name || c.phone).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{c.name || "Unnamed"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.phone}
                  {c.email ? ` · ${c.email}` : ""}
                  {c.company ? ` · ${c.company}` : ""}
                </p>
              </div>
              <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                <div className="flex gap-1">
                  {c.tags.slice(0, 3).map((t) => (
                    <Badge key={t.tag.id} variant="outline">
                      {t.tag.name}
                    </Badge>
                  ))}
                </div>
                <span className="text-[11px] tabular-nums text-muted-foreground">Updated {fmtDate(c.updatedAt)}</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
      {(page > 1 || hasMore) && <Pagination page={page} hasMore={hasMore} baseHref={baseHref} />}
    </>
  );
}
