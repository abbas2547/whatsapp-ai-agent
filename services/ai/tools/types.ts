import { z } from "zod";
import type { OrgContext } from "@/lib/tenant";
import type { AIToolSpec } from "@/services/ai/provider";

export type ToolContext = OrgContext & {
  conversationId?: string;
  contactId?: string;
  agentId: string;
};

export type AgentToolDefinition = {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  jsonSchema: Record<string, unknown>;
  execute: (ctx: ToolContext, input: Record<string, unknown>) => Promise<unknown>;
};

export function toAIToolSpec(tool: AgentToolDefinition): AIToolSpec {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.jsonSchema,
  };
}
