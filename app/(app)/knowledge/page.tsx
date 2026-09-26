import type { Metadata } from "next";
import { requireSessionOrRedirect } from "@/app/actions/session";
import { listKnowledgeBases } from "@/services/knowledge/knowledge.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/badge";
import { CreateKnowledgeBaseDialog } from "@/components/knowledge/create-kb-dialog";
import { AddDocumentDialog } from "@/components/knowledge/add-doc-dialog";
import { DocumentRowActions } from "@/components/knowledge/doc-actions";
import { DebouncedSearch } from "@/components/ui/debounced-search";
import { fmtDate } from "@/components/format";
import { Database, FileText, Globe, CircleHelp, Package } from "lucide-react";

export const metadata: Metadata = { title: "Knowledge" };

function sourceIcon(sourceType: string) {
  if (sourceType === "faq") return CircleHelp;
  if (sourceType === "product") return Package;
  if (sourceType === "manual") return FileText;
  if (sourceType.includes("url") || sourceType.includes("web")) return Globe;
  return FileText;
}

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSessionOrRedirect();
  const orgId = session.user.organizationId!;
  const sp = await searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const bases = await listKnowledgeBases(orgId);

  const filtered = query
    ? bases
        .map((kb) => ({
          ...kb,
          documents: kb.documents.filter((d) => d.name.toLowerCase().includes(query)),
        }))
        .filter((kb) => kb.name.toLowerCase().includes(query) || kb.documents.length > 0)
    : bases;

  const totalDocs = bases.reduce((n, kb) => n + kb.documents.length, 0);
  const readyDocs = bases.reduce((n, kb) => n + kb.documents.filter((d) => d.status === "READY").length, 0);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <PageHeader
        title="Knowledge Base"
        description={`Approved answers your agents can use — ${readyDocs} of ${totalDocs} documents ready. Agents never invent facts outside this.`}
        actions={
          <div className="flex items-center gap-2">
            <DebouncedSearch placeholder="Search documents…" initial={query} className="w-52" />
            <CreateKnowledgeBaseDialog />
          </div>
        }
      />

      {filtered.length ? (
        <div className="flex flex-col gap-4">
          {filtered.map((kb) => (
            <Card key={kb.id} className="overflow-hidden">
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 bg-muted/40">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                    <Database className="h-4 w-4 text-primary" />
                  </span>
                  <div className="min-w-0">
                    <CardTitle className="truncate">{kb.name}</CardTitle>
                    {kb.description ? <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{kb.description}</p> : null}
                    <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                      {kb.documents.length} document{kb.documents.length === 1 ? "" : "s"} · updated {fmtDate(kb.updatedAt)}
                    </p>
                  </div>
                </div>
                <AddDocumentDialog knowledgeBaseId={kb.id} />
              </CardHeader>
              <CardContent className="pt-2">
                {kb.documents.length ? (
                  <div className="flex flex-col divide-y divide-border">
                    {kb.documents.map((doc) => {
                      const Icon = sourceIcon(doc.sourceType);
                      return (
                        <div key={doc.id} className="flex items-center justify-between gap-3 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{doc.name}</p>
                              <p className="text-[11px] tabular-nums text-muted-foreground">
                                {doc.sourceType} · {(doc.sizeBytes ?? 0).toLocaleString()} bytes · {doc.chunkCount} chunk{doc.chunkCount === 1 ? "" : "s"} · {fmtDate(doc.createdAt)}
                              </p>
                              {doc.error ? <p className="text-xs font-medium text-red-600" role="alert">{doc.error}</p> : null}
                            </div>
                          </div>
                          <DocumentRowActions doc={{ id: doc.id, name: doc.name, sourceType: doc.sourceType, status: doc.status }} />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      No documents yet. Add text, or upload PDF / DOCX / TXT below.
                    </p>
                    <form
                      method="post"
                      action="/api/knowledge/upload"
                      encType="multipart/form-data"
                      className="flex flex-wrap items-center justify-center gap-2"
                    >
                      <input type="hidden" name="knowledgeBaseId" value={kb.id} />
                      <input
                        type="file"
                        name="file"
                        accept=".pdf,.docx,.doc,.txt,application/pdf,text/plain"
                        className="max-w-xs text-xs"
                        required
                        aria-label="Upload document"
                      />
                      <button
                        type="submit"
                        className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold shadow-sm hover:bg-muted"
                      >
                        Upload
                      </button>
                    </form>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Database}
          title={query ? `No results for “${query}”` : "No knowledge bases"}
          description={
            query
              ? "Try a different search."
              : "Create a knowledge base with your products, FAQ and policies so agents can answer accurately."
          }
          action={query ? undefined : <CreateKnowledgeBaseDialog />}
        />
      )}
    </div>
  );
}
