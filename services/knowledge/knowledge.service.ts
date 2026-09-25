import { after } from "next/server";
import { db } from "@/lib/db";
import { chunkText, cosineSimilarity } from "@/lib/utils";
import { AppError } from "@/lib/errors";
import { getAIProvider } from "@/services/ai/provider";
import { writeAuditLog } from "@/services/audit/audit.service";

export async function listKnowledgeBases(organizationId: string) {
  return db.knowledgeBase.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      description: true,
      updatedAt: true,
      documents: {
        select: {
          id: true,
          name: true,
          sourceType: true,
          mimeType: true,
          sizeBytes: true,
          status: true,
          chunkCount: true,
          error: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createKnowledgeBase(organizationId: string, userId: string, name: string, description?: string) {
  const kb = await db.knowledgeBase.create({ data: { organizationId, name, description } });
  await writeAuditLog({
    organizationId,
    userId,
    action: "knowledge.created",
    entityType: "knowledge_base",
    entityId: kb.id,
  });
  return kb;
}

export async function addDocument(input: {
  organizationId: string;
  userId: string;
  knowledgeBaseId: string;
  name: string;
  sourceType: "pdf" | "docx" | "txt" | "manual" | "faq" | "product";
  mimeType?: string;
  sizeBytes?: number;
  content: string;
}) {
  const kb = await db.knowledgeBase.findFirst({
    where: { id: input.knowledgeBaseId, organizationId: input.organizationId },
  });
  if (!kb) throw new AppError("Knowledge base not found", "NOT_FOUND", 404);

  const doc = await db.knowledgeDocument.create({
    data: {
      organizationId: input.organizationId,
      knowledgeBaseId: input.knowledgeBaseId,
      name: input.name,
      sourceType: input.sourceType,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes || Buffer.byteLength(input.content),
      status: "PROCESSING",
      content: input.content,
    },
  });

  after(() =>
    processDocument(doc.id).catch(async (error) => {
      await db.knowledgeDocument.update({
        where: { id: doc.id },
        data: { status: "FAILED", error: error instanceof Error ? error.message : "Processing failed" },
      });
    }),
  );

  return doc;
}

export async function processDocument(documentId: string) {
  const doc = await db.knowledgeDocument.findUnique({ where: { id: documentId } });
  if (!doc?.content) throw new Error("Document missing content");
  const chunks = chunkText(doc.content);
  const provider = getAIProvider();
  const embeddings = chunks.length ? await provider.embed(chunks) : [];
  await db.documentChunk.deleteMany({ where: { documentId } });
  if (chunks.length) {
    await db.documentChunk.createMany({
      data: chunks.map((content, chunkIndex) => ({
        organizationId: doc.organizationId,
        documentId: doc.id,
        knowledgeBaseId: doc.knowledgeBaseId,
        content,
        // Guard against a short embedding response: store null rather than misaligning.
        embedding: (embeddings[chunkIndex] ?? null) as unknown as never,
        chunkIndex,
      })),
    });
  }
  await db.knowledgeDocument.update({
    where: { id: documentId },
    data: { status: "READY", chunkCount: chunks.length, error: null },
  });
}

export async function searchKnowledge(organizationId: string, agentId: string, query: string) {
  // Scope the agent to this organization so a forged agentId can't leak another org's KB.
  const agent = await db.agent.findFirst({ where: { id: agentId, organizationId }, select: { id: true } });
  if (!agent) return [];
  const links = await db.agentKnowledgeBase.findMany({ where: { agentId: agent.id } });
  const kbIds = links.map((l) => l.knowledgeBaseId);
  if (!kbIds.length) return [];
  const chunks = await db.documentChunk.findMany({
    where: {
      organizationId,
      knowledgeBaseId: { in: kbIds },
      document: { status: "READY" },
    },
    take: 400,
  });
  if (!chunks.length) return [];
  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = (await getAIProvider().embed([query]))[0];
  } catch {
    queryEmbedding = null;
  }
  const scored = chunks
    .map((chunk: { embedding: unknown; content: string; documentId: string }) => {
      const embedding = Array.isArray(chunk.embedding) ? (chunk.embedding as number[]) : [];
      const score = queryEmbedding && embedding.length ? cosineSimilarity(queryEmbedding, embedding) : lexicalScore(query, chunk.content);
      return { content: chunk.content, score, documentId: chunk.documentId };
    })
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
    .slice(0, 6)
    .filter((c: { score: number }) => c.score > 0.12);
  return scored;
}

function lexicalScore(query: string, content: string) {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  if (!terms.length) return 0;
  const hay = content.toLowerCase();
  const hits = terms.filter((t) => hay.includes(t)).length;
  return hits / terms.length;
}

export async function extractUploadText(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt")) return buffer.toString("utf8");
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (name.endsWith(".pdf")) {
    // pdf-parse v2 API: instantiate with { data }, then getText(). Never call it as a function.
    const pdfParseModule = await import("pdf-parse");
    const parser = new pdfParseModule.PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }
  throw new AppError("Unsupported file type. Upload PDF, DOCX, or TXT.", "UNSUPPORTED_FILE");
}
