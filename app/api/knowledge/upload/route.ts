import { NextResponse } from "next/server";
import { requireOrgContext, assertCanManageAgents } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";
import { addDocument, extractUploadText, MAX_KB_CONTENT_CHARS } from "@/services/knowledge/knowledge.service";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
]);

/** Strip path components and control chars so stored names can't do XSS/path tricks. */
function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() || "upload";
  return base.replace(/[<>:"|?*\x00-\x1f]/g, "").trim().slice(0, 120) || "upload";
}

export async function POST(request: Request) {
  try {
    const ctx = await requireOrgContext();
    assertCanManageAgents(ctx);
    const limited = rateLimit(`kb-upload:${ctx.userId}`, 20, 60_000);
    if (!limited.success) {
      return NextResponse.json({ error: "Too many uploads. Please wait a minute and try again." }, { status: 429 });
    }
    const form = await request.formData();
    const file = form.get("file");
    const knowledgeBaseId = String(form.get("knowledgeBaseId") || "");
    if (!(file instanceof File) || !knowledgeBaseId) {
      return NextResponse.json({ error: "file and knowledgeBaseId are required" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File is too large (max 10 MB)." }, { status: 400 });
    }
    if (file.type && !ALLOWED_MIME.has(file.type) && !file.type.startsWith("text/")) {
      return NextResponse.json({ error: "Unsupported file type. Upload PDF, DOCX, or TXT." }, { status: 400 });
    }
    const content = await extractUploadText(file);
    if (!content.trim()) {
      return NextResponse.json({ error: "No readable text found in this file." }, { status: 400 });
    }
    if (content.length > MAX_KB_CONTENT_CHARS) {
      return NextResponse.json(
        { error: `Extracted text is too large (${Math.round(content.length / 1024)} KB). Please split it into smaller files.` },
        { status: 400 },
      );
    }
    const lower = file.name.toLowerCase();
    const sourceType = lower.endsWith(".pdf")
      ? "pdf"
      : lower.endsWith(".docx")
        ? "docx"
        : "txt";
    const doc = await addDocument({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      knowledgeBaseId,
      name: sanitizeFileName(file.name),
      sourceType,
      mimeType: file.type || undefined,
      sizeBytes: file.size,
      content,
    });
    return NextResponse.json({ ok: true, doc });
  } catch (error) {
    // Never echo raw error internals (paths, parser messages) to the client.
    console.error("[knowledge-upload] failed:", error instanceof Error ? error.message : "unknown");
    const message =
      error instanceof Error && ["NOT_FOUND", "UNSUPPORTED_FILE", "LIMIT"].some((c) => error.message.includes(c))
        ? error.message
        : "Upload failed. Please try again with a PDF, DOCX, or TXT file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
