import { GoogleGenerativeAI, type FunctionDeclaration, type Part, SchemaType, type Schema } from "@google/generative-ai";
import { env, isPlaceholder } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { AIGenerateResult, AIMessage, AIProvider, AIToolSpec } from "./provider";

type ConvertedSchema = FunctionDeclaration["parameters"];

function jsonSchemaToGemini(parameters: Record<string, unknown>): ConvertedSchema {
  const properties = (parameters.properties || {}) as Record<
    string,
    { type?: string; description?: string; items?: { type?: string } }
  >;
  const converted: Record<string, Schema> = {};
  for (const [key, value] of Object.entries(properties)) {
    const schema = {
      type: mapType(value.type),
      description: value.description,
    } as Schema;
    if (value.items?.type) {
      (schema as { items?: Schema }).items = { type: mapType(value.items.type) } as Schema;
    }
    converted[key] = schema;
  }
  return {
    type: SchemaType.OBJECT,
    properties: converted,
    required: (parameters.required as string[]) || [],
  };
}

function mapType(type?: string): SchemaType {
  switch (type) {
    case "number":
    case "integer":
      return SchemaType.NUMBER;
    case "boolean":
      return SchemaType.BOOLEAN;
    case "array":
      return SchemaType.ARRAY;
    default:
      return SchemaType.STRING;
  }
}

/** Newer models sometimes return function args as a JSON string — normalize. */
function normalizeToolArgs(args: unknown): Record<string, unknown> {
  if (args && typeof args === "object") return args as Record<string, unknown>;
  if (typeof args === "string" && args.trim()) {
    try {
      const parsed: unknown = JSON.parse(args);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      // fall through to empty args
    }
  }
  return {};
}

/**
 * Converts internal messages to Gemini contents. Newer Gemini models strictly
 * require user/model alternation, so:
 * - tool results become `user` messages with proper `functionResponse` parts
 *   (the API-correct shape, not plain text), and
 * - consecutive same-role messages are merged into one.
 */
function toGeminiContents(messages: AIMessage[]): { role: "user" | "model"; parts: Part[] }[] {
  const raw: { role: "user" | "model"; parts: Part[] }[] = [];
  for (const m of messages) {
    if (m.role === "tool") {
      let response: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(m.content);
        response =
          parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : { result: m.content };
      } catch {
        response = { result: m.content.slice(0, 8000) };
      }
      raw.push({
        role: "user",
        parts: [{ functionResponse: { name: m.name || "tool", response } } as Part],
      });
    } else if (m.role === "assistant") {
      if (!m.content) continue;
      raw.push({ role: "model", parts: [{ text: m.content }] });
    } else {
      if (!m.content) continue;
      raw.push({ role: "user", parts: [{ text: m.content }] });
    }
  }
  const merged: { role: "user" | "model"; parts: Part[] }[] = [];
  for (const c of raw) {
    const last = merged[merged.length - 1];
    if (last && last.role === c.role) last.parts.push(...c.parts);
    else merged.push({ role: c.role, parts: [...c.parts] });
  }
  // The API rejects a conversation starting with a model turn (can happen
  // when filtered history begins with an assistant message).
  while (merged.length && merged[0].role !== "user") merged.shift();
  return merged;
}

export class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  private client: GoogleGenerativeAI;

  constructor() {
    const key = env().GEMINI_API_KEY;
    if (isPlaceholder(key)) {
      throw new AppError("Gemini API key is not configured.", "AI_NOT_CONFIGURED", 400);
    }
    this.client = new GoogleGenerativeAI(key!);
  }

  /**
   * Chat models to try, in order. gemini-2.5-flash is first: it has the
   * largest serving capacity and rarely 503s. Newer flash models follow.
   * Google retires/overloads model names regularly, so any failover-eligible
   * error (retired name, overloaded model, rate limit) moves to the next.
   * Override the primary with GEMINI_MODEL=... in .env.local.
   */
  private chatModels(): string[] {
    const primary = (env().GEMINI_MODEL || "").trim() || "gemini-2.5-flash";
    return [...new Set([primary, "gemini-3.8-flash", "gemini-flash-latest"])];
  }

  private embeddingModels(): string[] {
    const primary = (env().GEMINI_EMBEDDING_MODEL || "").trim() || "gemini-embedding-001";
    return [...new Set([primary, "text-embedding-004"])];
  }

  /**
   * True when trying the NEXT model could help: retired/unknown model name
   * (404), model overloaded or service unavailable (503), or rate-limited
   * (429, often per-model). Anything else (bad key, invalid request,
   * safety block) is thrown immediately.
   */
  private isFailoverError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error || "");
    return /\[404|\[503|\[429|not[ -]found|no longer available|not supported for|overloaded|high demand|service unavailable|rate.?limit|resource.?exhausted|quota/i.test(
      msg,
    );
  }

  /** True when the error means Google is out of capacity right now. */
  private isOverloaded(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error || "");
    return /\[503|overloaded|high demand|service unavailable/i.test(msg);
  }

  async generate(input: {
    messages: AIMessage[];
    tools?: AIToolSpec[];
    temperature?: number;
  }): Promise<AIGenerateResult> {
    const system = input.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = toGeminiContents(input.messages.filter((m) => m.role !== "system"));

    let lastError: unknown = null;
    for (const modelName of this.chatModels()) {
      try {
        return await this.generateWithModel(modelName, system, contents, input.tools, input.temperature);
      } catch (error) {
        lastError = error;
        // Retired name, overloaded model, or rate limit → try the next model.
        // Any other error (bad key, invalid request, safety block) is thrown
        // immediately so the real problem stays visible.
        if (!this.isFailoverError(error)) throw error;
        console.error(`[ai] chat model "${modelName}" failed, trying fallback:`, error instanceof Error ? error.message.slice(0, 200) : "unknown");
      }
    }
    // Every model unavailable: if Google is simply out of capacity, say so
    // plainly (retryable) instead of leaking provider internals.
    if (this.isOverloaded(lastError)) {
      throw new AppError(
        "Google's AI is experiencing high demand right now. Please try again in a moment.",
        "AI_OVERLOADED",
        503,
      );
    }
    throw lastError instanceof Error ? lastError : new Error("All Gemini chat models failed.");
  }

  private async generateWithModel(
    modelName: string,
    system: string,
    contents: { role: "user" | "model"; parts: Part[] }[],
    tools?: AIToolSpec[],
    temperature?: number,
  ): Promise<AIGenerateResult> {
    const model = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: system || undefined,
      tools: tools?.length
        ? [
            {
              functionDeclarations: tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parameters: jsonSchemaToGemini(tool.parameters),
              })),
            },
          ]
        : undefined,
    });

    const result = await model.generateContent({
      contents,
      generationConfig: { temperature: temperature ?? 0.3 },
    });
    const response = result.response;
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const text = parts.map((p) => p.text || "").join("").trim();
    const toolCalls = parts
      .filter((p) => p.functionCall)
      .map((p, index) => ({
        id: `call_${index}`,
        name: p.functionCall!.name,
        // Newer models may return args as a JSON string instead of an object.
        arguments: normalizeToolArgs(p.functionCall!.args),
      }));

    // Empty reply with no tool calls means the model refused/blocked — say so
    // plainly instead of letting the caller show a generic "problem" message.
    if (!text && toolCalls.length === 0) {
      const blockReason = response.promptFeedback?.blockReason;
      const finishReason = candidate?.finishReason;
      if (blockReason && blockReason !== "BLOCKED_REASON_UNSPECIFIED") {
        throw new AppError(
          "The AI declined to answer that message (safety filters). Please rephrase and try again.",
          "AI_SAFETY_BLOCK",
          400,
        );
      }
      if (finishReason && ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT"].includes(finishReason)) {
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
        inputTokens: response.usageMetadata?.promptTokenCount,
        outputTokens: response.usageMetadata?.candidatesTokenCount,
      },
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    let lastError: unknown = null;
    for (const modelName of this.embeddingModels()) {
      try {
        const model = this.client.getGenerativeModel({ model: modelName });
        const vectors: number[][] = [];
        for (const text of texts) {
          const result = await model.embedContent(text.slice(0, 8000));
          vectors.push(result.embedding.values);
        }
        return vectors;
      } catch (error) {
        lastError = error;
        if (!this.isFailoverError(error)) throw error;
        console.error(`[ai] embedding model "${modelName}" failed, trying fallback:`, error instanceof Error ? error.message.slice(0, 200) : "unknown");
      }
    }
    throw lastError instanceof Error ? lastError : new Error("All Gemini embedding models failed.");
  }
}
