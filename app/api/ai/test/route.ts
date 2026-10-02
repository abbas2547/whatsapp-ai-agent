import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { assertCanManageAgents, requireOrgContext } from "@/lib/tenant";
import { processAgentTurn } from "@/services/ai/runtime";

function statusFor(error: unknown): number {
  if (error instanceof AppError) return error.status;
  return 500;
}

const bodySchema = z.object({
  agentId: z.string().min(1).max(64),
  message: z.string().min(1).max(4000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(20)
    .optional(),
});

/**
 * Server-side AI test endpoint — exercises the real configured provider
 * (OpenRouter) without sending a WhatsApp message.
 *
 * POST /api/ai/test  { agentId, message, history? }
 * → { success: true, response }
 *
 * Protected by the existing workspace auth: the agent must belong to the
 * caller's organization (processAgentTurn is org-scoped). The OpenRouter key
 * is never returned — only the agent's text reply.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireOrgContext();
    assertCanManageAgents(ctx);
    const limited = rateLimit(`ai-test:${ctx.userId}`, 20, 60_000);
    if (!limited.success) {
      throw new AppError("Too many test runs. Please wait a moment.", "RATE_LIMITED", 429);
    }
    const raw = (await request.json().catch(() => null)) as unknown;
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError("Provide agentId and message to test.", "INVALID_INPUT", 400);
    }
    const result = await processAgentTurn({
      organizationId: ctx.organizationId,
      agentId: parsed.data.agentId,
      userMessage: parsed.data.message.trim(),
      history: (parsed.data.history || []).map((h) => ({ role: h.role, content: h.content })),
      mode: "test",
    });
    return NextResponse.json({ success: true, response: result.reply });
  } catch (error) {
    const status = statusFor(error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "AI test failed." },
      { status },
    );
  }
}
