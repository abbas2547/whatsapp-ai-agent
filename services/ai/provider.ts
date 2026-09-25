export type AIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
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

export function getAIProvider(): AIProvider {
  return new GeminiProvider();
}
