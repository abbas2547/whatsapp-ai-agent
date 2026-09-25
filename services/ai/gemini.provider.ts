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

  async generate(input: {
    messages: AIMessage[];
    tools?: AIToolSpec[];
    temperature?: number;
  }): Promise<AIGenerateResult> {
    const system = input.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = input.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" || m.role === "tool" ? "model" : "user",
        parts: [{ text: m.role === "tool" ? `TOOL RESULT (${m.name}): ${m.content}` : m.content }] as Part[],
      }));

    const model = this.client.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: system || undefined,
      tools: input.tools?.length
        ? [
            {
              functionDeclarations: input.tools.map((tool) => ({
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
      generationConfig: { temperature: input.temperature ?? 0.3 },
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
        arguments: (p.functionCall!.args || {}) as Record<string, unknown>,
      }));

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
    const model = this.client.getGenerativeModel({ model: "text-embedding-004" });
    const vectors: number[][] = [];
    for (const text of texts) {
      const result = await model.embedContent(text.slice(0, 8000));
      vectors.push(result.embedding.values);
    }
    return vectors;
  }
}
