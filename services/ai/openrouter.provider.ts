import { env, isPlaceholder } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { AIGenerateResult, AIMessage, AIProvider, AIToolSpec } from "./provider";

type OpenRouterToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenRouterMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_calls?: OpenRouterToolCall[];
  tool_call_id?: string;
};

function normalizeToolArgs(raw: string | object | undefined): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    // fall through
  }
  return {};
}

/**
 * OpenRouter — OpenAI-compatible chat + embeddings gateway.
 *
 * Why OpenRouter (best-results setup):
 * - One key unlocks many frontier models with automatic failover.
 * - Native OpenAI-style function calling (reliable tool use for leads,
 *   calendar, handoff, knowledge search).
 * - Structured fallbacks: if the primary model 429s/503s/404s we rotate to
 *   the next model instead of failing the WhatsApp reply.
 *
 * Configure with:
 *   OPENROUTER_API_KEY=sk-or-v1-...
 *   OPENROUTER_MODEL=openai/gpt-4o-mini            (optional override)
 *   OPENROUTER_FALLBACKS=model-a,model-b           (optional override)
 *   OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small
 */
export class OpenRouterProvider implements AIProvider {
  readonly id = "openrouter";

  private apiKey(): string {
    const key = env().OPENROUTER_API_KEY;
    if (isPlaceholder(key)) {
      throw new AppError(
        "OpenRouter API key is not configured. Set OPENROUTER_API_KEY in .env.local.",
        "AI_NOT_CONFIGURED",
        400,
      );
    }
    const clean = key!.trim();
    // Genuine OpenRouter keys start with sk-or-v1-…. Anything else (a pasted
    // fragment, another provider's key, a truncated value) can never
    // authenticate — fail here with an actionable message instead of a
    // cryptic 401 from the gateway after the request is sent.
    if (!clean.startsWith("sk-or-v1-") || clean.length < 20) {
      throw new AppError(
        "OPENROUTER_API_KEY doesn't look like an OpenRouter key (it should start with sk-or-v1-…). Copy the full key from https://openrouter.ai/keys into .env.local and restart the server.",
        "AI_NOT_CONFIGURED",
        400,
      );
    }
    return clean;
  }

  private baseUrl(): string {
    const raw = (env().OPENROUTER_BASE_URL || "").trim();
    return (raw || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  }

  /**
   * Best-results default stack for WhatsApp agents:
   * 1. gpt-4o-mini — fast, cheap, excellent function-calling + instruction following.
   * 2. gemini-flash — large context, strong multilingual, good fallback capacity.
   * 3. claude-haiku — careful, concise, great tone for customer chat.
   * 4. llama-70b — open fallback when the big labs are saturated.
   * Override the primary with OPENROUTER_MODEL=... and the list with
   * OPENROUTER_FALLBACKS=a,b,c
   */
  private chatModels(): string[] {
    const primary = (env().OPENROUTER_MODEL || "").trim() || "openai/gpt-4o-mini";
    const fallbacksRaw = (env().OPENROUTER_FALLBACKS || "").trim();
    const fallbacks = fallbacksRaw
      ? fallbacksRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [
          "google/gemini-flash-1.5",
          "anthropic/claude-3.5-haiku",
          "meta-llama/llama-3.1-70b-instruct",
        ];
    return [...new Set([primary, ...fallbacks])];
  }

  private embeddingModel(): string {
    return (env().OPENROUTER_EMBEDDING_MODEL || "").trim() || "openai/text-embedding-3-small";
  }

  private headers(): Record<string, string> {
    const site = (env().OPENROUTER_SITE_URL || env().NEXT_PUBLIC_APP_URL || env().NEXTAUTH_URL || "").trim();
    const title = (env().OPENROUTER_APP_NAME || "eluue ai agent").trim();
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey()}`,
      "Content-Type": "application/json",
    };
    if (site) h["HTTP-Referer"] = site;
    if (title) h["X-Title"] = title;
    return h;
  }

  private toOpenRouterMessages(messages: AIMessage[]): OpenRouterMessage[] {
    const out: OpenRouterMessage[] = [];
    for (const m of messages) {
      if (m.role === "system") {
        if (m.content) out.push({ role: "system", content: m.content });
      } else if (m.role === "user") {
        if (m.content) out.push({ role: "user", content: m.content });
      } else if (m.role === "assistant") {
        if (m.toolCalls?.length) {
          out.push({
            role: "assistant",
            content: m.content || null,
            tool_calls: m.toolCalls.map((c) => ({
              id: c.id,
              type: "function" as const,
              function: { name: c.name, arguments: JSON.stringify(c.arguments || {}) },
            })),
          });
        } else if (m.content) {
          out.push({ role: "assistant", content: m.content });
        }
      } else if (m.role === "tool") {
        // OpenAI tool-result shape: role "tool" + tool_call_id + name + content.
        // toolCallId links the result to the assistant's tool_calls entry.
        out.push({
          role: "tool",
          tool_call_id: m.toolCallId || m.id || m.name || "tool",
          name: m.name,
          content: m.content,
        });
      }
    }
    // OpenRouter/OpenAI rejects a conversation starting with assistant/tool.
    while (out.length && (out[0].role === "assistant" || out[0].role === "tool")) out.shift();
    return out;
  }

  private isFailoverError(status: number, message: string): boolean {
    if (status === 429 || status === 503 || status === 502 || status === 404) return true;
    return /rate.?limit|quota|overloaded|high demand|service unavailable|temporarily|capacity|no longer available|not supported|not[ -]found|model.*not/i.test(
      message,
    );
  }

  private isOverloaded(status: number, message: string): boolean {
    if (status === 503 || status === 502) return true;
    return /overloaded|high demand|service unavailable|capacity/i.test(message);
  }

  async generate(input: {
    messages: AIMessage[];
    tools?: AIToolSpec[];
    temperature?: number;
  }): Promise<AIGenerateResult> {
    const messages = this.toOpenRouterMessages(input.messages);
    const tools = (input.tools || []).map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters && Object.keys(t.parameters).length ? t.parameters : { type: "object", properties: {} },
      },
    }));

    let lastError: { status: number; message: string } | null = null;

    // TEMP-DIAGNOSTIC (Phase 8): proves which key/model the RUNNING server
    // process actually uses. Masked only — first 12 + last 4 chars, never the
    // full key, never the Authorization header. Compare with the working
    // PowerShell key's fingerprint; if they differ, the server has stale env
    // (restart it). Remove the key fragment after confirming.
    const diagModels = this.chatModels();
    const diagKey = this.apiKey();
    console.log(
      `[AI] provider=openrouter model=${diagModels[0]} key=${diagKey.slice(0, 12)}...${diagKey.slice(-4)} len=${diagKey.length}`,
    );

    for (const model of diagModels) {
      try {
        return await this.generateWithModel(model, messages, tools, input.temperature);
      } catch (e) {
        const err = e as { status?: number; message?: string };
        const status = err?.status || 0;
        const message = err?.message || "unknown";
        // Auth / payment / timeout errors must surface immediately — rotating
        // models won't help (same key, same account, same slowness budget).
        if (status === 401 || status === 403 || status === 402 || status === 504) throw e;
        if (status === 400 && !this.isFailoverError(status, message)) throw e;
        lastError = { status, message };
        console.error(`[ai/openrouter] model "${model}" failed (${status}), trying fallback:`, message.slice(0, 220));
      }
    }

    if (lastError && this.isOverloaded(lastError.status, lastError.message)) {
      throw new AppError(
        "The AI is experiencing high demand right now. Please try again in a moment.",
        "AI_OVERLOADED",
        503,
      );
    }
    throw new AppError(
      `AI request failed${lastError ? `: ${lastError.message.slice(0, 200)}` : "."}`,
      "AI_FAILED",
      502,
    );
  }

  private async generateWithModel(
    model: string,
    messages: OpenRouterMessage[],
    tools: Array<{ type: "function"; function: { name: string; description: string; parameters: unknown } }>,
    temperature?: number,
  ): Promise<AIGenerateResult> {
    // Inject pending assistant tool_calls back as proper history is handled by
    // the runtime (it appends tool results as role=tool). Here we just send.
    // A hard timeout keeps WhatsApp webhooks responsive — a hung provider
    // must fail fast so the fallback path (not a retry storm) answers.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl()}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model,
          messages,
          tools: tools.length ? tools : undefined,
          tool_choice: tools.length ? "auto" : undefined,
          temperature: temperature ?? 0.3,
          top_p: 0.9,
          max_tokens: 800,
        }),
        signal: controller.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new AppError(
          "The AI took too long to respond. Please try again in a moment.",
          "AI_TIMEOUT",
          504,
        );
      }
      throw new AppError("AI request failed before a response was received.", "AI_FAILED", 502);
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`OpenRouter ${res.status}: ${text.slice(0, 300) || res.statusText}`) as Error & {
        status: number;
      };
      err.status = res.status;
      // Surface auth problems with a clear actionable message. Include
      // OpenRouter's own short reason (e.g. "User not found.") — its 401/403
      // messages never echo the key, and the exact reason beats guessing.
      if (res.status === 401 || res.status === 403) {
        let detail = "";
        try {
          const parsed = JSON.parse(text) as { error?: { message?: unknown } };
          if (typeof parsed?.error?.message === "string") detail = parsed.error.message.slice(0, 150);
        } catch {
          // Keep the generic message below.
        }
        throw new AppError(
          `OpenRouter rejected the API key (${res.status}${detail ? `: ${detail}` : ""}). Check OPENROUTER_API_KEY and its credit/allowances.`,
          "AI_NOT_CONFIGURED",
          400,
        );
      }
      // Out of credits / payment required — rotating models cannot help.
      if (res.status === 402) {
        throw new AppError(
          "OpenRouter reported insufficient credits (402). Top up the OpenRouter account.",
          "AI_PAYMENT_REQUIRED",
          402,
        );
      }
      throw err;
    }

    let json: {
      choices?: Array<{
        message?: { content?: string | null; tool_calls?: OpenRouterToolCall[] };
        finish_reason?: string;
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    try {
      json = (await res.json()) as typeof json;
    } catch {
      throw new AppError("AI returned an unreadable response.", "AI_FAILED", 502);
    }

    const msg = json.choices?.[0]?.message;
    const text = (msg?.content || "").trim();
    const toolCalls = (msg?.tool_calls || [])
      .filter((c) => c?.function?.name)
      .map((c, i) => ({
        id: c.id || `call_${i}`,
        name: c.function.name,
        arguments: normalizeToolArgs(c.function.arguments),
      }));

    // Safety/refusal with no usable output — surface plainly.
    if (!text && toolCalls.length === 0) {
      const finish = json.choices?.[0]?.finish_reason || "";
      if (["content_filter", "safety"].includes(finish)) {
        throw new AppError(
          "The AI declined to answer that message (safety filters). Please rephrase and try again.",
          "AI_SAFETY_BLOCK",
          400,
        );
      }
    }

    return {
      text,
      toolCalls,
      usage: {
        inputTokens: json.usage?.prompt_tokens,
        outputTokens: json.usage?.completion_tokens,
      },
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl()}/embeddings`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: this.embeddingModel(),
        input: texts.map((t) => t.slice(0, 8000)),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenRouter embeddings ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const vectors = (json.data || []).map((d) => d.embedding || []);
    if (vectors.length !== texts.length) {
      throw new Error("Embedding response length mismatch");
    }
    return vectors;
  }
}
