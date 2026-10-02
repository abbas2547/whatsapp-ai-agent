export type AIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  /** OpenAI-style tool-call plumbing (used by OpenRouter; ignored by Gemini). */
  id?: string;
  toolCalls?: AIToolCall[];
  toolCallId?: string;
};

export type AIToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AIToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type AIGenerateResult = {
  text: string;
  toolCalls: AIToolCall[];
  usage?: { inputTokens?: number; outputTokens?: number };
};

export interface AIProvider {
  readonly id: string;
  generate(input: {
    messages: AIMessage[];
    tools?: AIToolSpec[];
    temperature?: number;
  }): Promise<AIGenerateResult>;
  embed(texts: string[]): Promise<number[][]>;
}

import { GeminiProvider } from "./gemini.provider";
import { OpenRouterProvider } from "./openrouter.provider";
import { env, isPlaceholder } from "@/lib/env";

export function getAIProvider(): AIProvider {
  // Default is now OpenRouter. Gemini stays as a legacy fallback when no
  // OpenRouter key is configured (backward compatible for existing installs).
  const want = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  const hasOpenRouter = !isPlaceholder(env().OPENROUTER_API_KEY);
  const hasGemini = !isPlaceholder(env().GEMINI_API_KEY);
  if (want === "gemini") {
    if (hasGemini) return new GeminiProvider();
    if (hasOpenRouter) return new OpenRouterProvider();
    return new GeminiProvider(); // throws a clear AI_NOT_CONFIGURED
  }
  if (hasOpenRouter) return new OpenRouterProvider();
  if (hasGemini) return new GeminiProvider();
  // No key at all — construct OpenRouter so the error message points at the
  // current recommended variable (OPENROUTER_API_KEY).
  return new OpenRouterProvider();
}

export function getAIProviderId(): string {
  try {
    return getAIProvider().id;
  } catch {
    return "openrouter";
  }
}

/**
 * Safe-for-client AI status: provider name, model name and whether a key is
 * configured. NEVER includes the key itself — pass this (not env) to UI.
 */
export type AIPublicStatus = {
  provider: string;
  model: string;
  connected: boolean;
};

export function getAIPublicStatus(): AIPublicStatus {
  const openrouter = env().OPENROUTER_API_KEY;
  if (!isPlaceholder(openrouter)) {
    return {
      provider: "OpenRouter",
      model: (env().OPENROUTER_MODEL || "").trim() || "openai/gpt-4o-mini",
      connected: true,
    };
  }
  const gemini = env().GEMINI_API_KEY;
  if (!isPlaceholder(gemini)) {
    return {
      provider: "Gemini (legacy)",
      model: (env().GEMINI_MODEL || "").trim() || "gemini-2.5-flash",
      connected: true,
    };
  }
  return { provider: "Not configured", model: "—", connected: false };
}
