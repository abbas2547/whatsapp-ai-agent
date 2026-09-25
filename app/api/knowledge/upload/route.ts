import { NextResponse } from "next/server";
import { requireOrgContext, assertCanManageAgents } from "@/lib/tenant";
import { addDocument, extractUploadText } from "@/services/knowledge/knowledge.service";

export async function POST(request: Request) {
  try {
    const ctx = await requireOrgContext();
    assertCanManageAgents(ctx);
    const form = await request.formData();
    const file = form.get("file");
    const knowledgeBaseId = String(form.get("knowledgeBaseId") || "");
    if (!(file instanceof File) || !knowledgeBaseId) {
      return NextResponse.json({ error: "file and knowledgeBaseId are required" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File is too large (max 10 MB)." }, { status: 400 });
    }
    const content = await extractUploadText(file);
    const sourceType = file.name.toLowerCase().endsWith(".pdf")
      ? "pdf"
      : file.name.toLowerCase().endsWith(".docx")
        ? "docx"
        : "txt";
    const doc = await addDocument({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      knowledgeBaseId,
      name: file.name,
      sourceType,
      mimeType: file.type,
      sizeBytes: file.size,
      content,
    });
    return NextResponse.json({ ok: true, doc });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 400 });
  }
}
