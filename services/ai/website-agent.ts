import { AgentGoal } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { createAgent } from "@/services/ai/agent.service";
import { addDocument, createKnowledgeBase } from "@/services/knowledge/knowledge.service";

const MAX_PAGES = 5;
const MAX_HTML_BYTES = 2_000_000;
const MAX_TOTAL_CHARS = 60_000;
const FETCH_TIMEOUT_MS = 15_000;

function normalizeWebsiteUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new AppError("Enter your business website URL.", "INVALID_URL", 400);
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProto);
  } catch {
    throw new AppError("That URL doesn't look valid. Copy your full website address and try again.", "INVALID_URL", 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError("Only http(s) websites can be imported.", "INVALID_URL", 400);
  }
  const host = url.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "169.254.169.254" ||
    host.startsWith("127.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (blocked) {
    throw new AppError("That address can't be imported. Use your public business website.", "INVALID_URL", 400);
  }
  return url;
}

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "WhatsAppAIAgent/1.0 (+website-import)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType && !/html|text/i.test(contentType)) return null;
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return text.slice(0, MAX_HTML_BYTES);
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.length;
        if (received > MAX_HTML_BYTES) break;
        chunks.push(value);
      }
    }
    const merged = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
    return merged;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCharCode(parseInt(n, 10));
      } catch {
        return "";
      }
    });
}

function htmlToText(html: string): { title: string; description: string; text: string } {
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]{0,300})<\/title>/i)?.[1] || "").trim());
  const description =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,500})["']/i)?.[1] ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{0,500})["']/i)?.[1] ||
    "";
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ");
  // Prefer headings + paragraphs + list items, fall back to all text.
  const picks: string[] = [];
  for (const tag of ["h1", "h2", "h3", "p", "li"]) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]{0,2000}?)<\\/${tag}>`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) && picks.join(" ").length < 30_000) {
      picks.push(m[1]);
    }
  }
  let raw = picks.length ? picks.join("\n") : body;
  raw = raw.replace(/<[^>]+>/g, " ");
  const text = decodeEntities(raw).replace(/\s+/g, " ").trim();
  return { title, description: decodeEntities(description).trim(), text };
}

function extractInternalLinks(html: string, base: URL, limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /href=["']([^"'#]{1,300})["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < limit * 3) {
    try {
      const abs = new URL(m[1], base);
      if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;
      if (abs.hostname.toLowerCase() !== base.hostname.toLowerCase()) continue;
      if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|mp4|mp3|zip|css|js|ico|xml)(\?|$)/i.test(abs.pathname)) continue;
      abs.hash = "";
      const href = abs.toString();
      if (seen.has(href)) continue;
      seen.add(href);
      out.push(href);
      if (out.length >= limit) break;
    } catch {
      // ignore malformed hrefs
    }
  }
  return out;
}

export type WebsiteCrawl = {
  url: string;
  hostname: string;
  title: string;
  description: string;
  text: string;
  pagesCrawled: number;
};

export async function crawlWebsite(rawUrl: string): Promise<WebsiteCrawl> {
  const base = normalizeWebsiteUrl(rawUrl);
  const visited = new Set<string>();
  const queue: string[] = [base.toString()];
  const texts: string[] = [];
  let title = "";
  let description = "";
  let combined = "";

  while (queue.length && visited.size < MAX_PAGES && combined.length < MAX_TOTAL_CHARS) {
    const next = queue.shift()!;
    if (visited.has(next)) continue;
    visited.add(next);
    const html = await fetchHtml(next);
    if (!html) continue;
    const parsed = htmlToText(html);
    if (!title && parsed.title) title = parsed.title;
    if (!description && parsed.description) description = parsed.description;
    const chunk = parsed.text.slice(0, 15_000);
    if (chunk.length > 200) {
      texts.push(`--- ${next} ---\n${chunk}`);
      combined += `\n${chunk}`;
    }
    if (visited.size === 1) {
      for (const link of extractInternalLinks(html, base, MAX_PAGES - 1)) {
        if (!visited.has(link) && !queue.includes(link)) queue.push(link);
      }
    }
  }

  const text = combined.slice(0, MAX_TOTAL_CHARS).trim();
  if (!text || text.length < 200) {
    throw new AppError(
      "Couldn't read enough content from that website. Make sure it's public and try again — or create your agent manually.",
      "WEBSITE_EMPTY",
      422,
    );
  }
  void texts;
  return {
    url: base.toString(),
    hostname: base.hostname,
    title: title || base.hostname,
    description,
    text,
    pagesCrawled: visited.size,
  };
}

type GeneratedAgent = {
  businessName: string;
  agentName: string;
  description: string;
  businessDescription: string;
  personality: string;
  tone: string;
  goal: AgentGoal;
  systemInstructions: string;
  rules: string;
  prohibitedActions: string;
  escalationRules: string;
  fallbackResponse: string;
  language: string;
};

const GOALS: AgentGoal[] = ["SALES", "LEAD_GENERATION", "CUSTOMER_SUPPORT", "APPOINTMENT_BOOKING", "GENERAL_ASSISTANT"];

function heuristicAgent(crawl: WebsiteCrawl): GeneratedAgent {
  const businessName = crawl.title.split(/[-|·]/)[0].trim().slice(0, 60) || crawl.hostname;
  const intro = crawl.text.slice(0, 900);
  return {
    businessName,
    agentName: `${businessName.slice(0, 24)} Assistant`.slice(0, 40),
    description: `Answers WhatsApp questions for ${businessName}`.slice(0, 140),
    businessDescription: `${businessName} (${crawl.url}). ${crawl.description || intro}`.slice(0, 2000),
    personality: "Warm, helpful, and concise. Replies like a friendly team member on WhatsApp.",
    tone: "Friendly, professional",
    goal: "CUSTOMER_SUPPORT",
    systemInstructions: `You represent ${businessName}. Always answer from the business information below. Key facts about the business: ${intro}. If a question isn't covered, say so honestly and offer to connect the customer with the team. Keep WhatsApp replies short (under 60 words) unless details are requested.`,
    rules: "Greet customers warmly. Answer product/service questions from business info. Collect name + need before promising anything. Offer a callback or appointment when the customer shows interest.",
    prohibitedActions: "Never invent prices, timings, policies, or availability. Never promise discounts or guarantees. Never share internal reasoning.",
    escalationRules: "Transfer to a human when the customer asks for a person, is unhappy, or after 2 uncertain answers.",
    fallbackResponse: `Thanks for asking! I don't have that detail about ${businessName} yet — let me connect you with our team.`,
    language: "en",
  };
}

async function aiGenerateAgent(crawl: WebsiteCrawl): Promise<GeneratedAgent | null> {
  try {
    const { getAIProvider } = await import("@/services/ai/provider");
    const provider = getAIProvider();
    const result = await provider.generate({
      messages: [
        {
          role: "system",
          content:
            "You configure WhatsApp AI sales/support agents. Reply with ONLY a JSON object (no code fences, no explanation) with keys: businessName, agentName (short, max 40 chars), description (max 140), businessDescription (2-4 sentences about what the business does, sells, and who it serves), personality (1-2 sentences), tone (short label), goal (one of SALES, LEAD_GENERATION, CUSTOMER_SUPPORT, APPOINTMENT_BOOKING, GENERAL_ASSISTANT), systemInstructions (5-8 sentences guiding WhatsApp replies), rules (things to do), prohibitedActions (things to never do), escalationRules (when to hand to human), fallbackResponse (one honest fallback sentence), language (e.g. en).",
        },
        {
          role: "user",
          content: `Business website: ${crawl.url}\nTitle: ${crawl.title}\nMeta: ${crawl.description}\nContent (from ${crawl.pagesCrawled} pages):\n${crawl.text.slice(0, 20_000)}`,
        },
      ],
      temperature: 0.4,
    });
    const raw = result.text.replace(/```json|```/g, "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<GeneratedAgent>;
    if (!parsed.businessDescription && !parsed.systemInstructions) return null;
    const fallback = heuristicAgent(crawl);
    const goal = GOALS.includes(parsed.goal as AgentGoal) ? (parsed.goal as AgentGoal) : fallback.goal;
    return {
      businessName: String(parsed.businessName || fallback.businessName).slice(0, 80),
      agentName: String(parsed.agentName || fallback.agentName).slice(0, 40),
      description: String(parsed.description || fallback.description).slice(0, 140),
      businessDescription: String(parsed.businessDescription || fallback.businessDescription).slice(0, 3000),
      personality: String(parsed.personality || fallback.personality).slice(0, 500),
      tone: String(parsed.tone || fallback.tone).slice(0, 80),
      goal,
      systemInstructions: String(parsed.systemInstructions || fallback.systemInstructions).slice(0, 4000),
      rules: String(parsed.rules || fallback.rules).slice(0, 2000),
      prohibitedActions: String(parsed.prohibitedActions || fallback.prohibitedActions).slice(0, 2000),
      escalationRules: String(parsed.escalationRules || fallback.escalationRules).slice(0, 2000),
      fallbackResponse: String(parsed.fallbackResponse || fallback.fallbackResponse).slice(0, 500),
      language: String(parsed.language || "en").slice(0, 8),
    };
  } catch {
    return null;
  }
}

export async function createAgentFromWebsite(organizationId: string, userId: string, rawUrl: string) {
  const crawl = await crawlWebsite(rawUrl);
  const generated = (await aiGenerateAgent(crawl)) || heuristicAgent(crawl);

  const kb = await createKnowledgeBase(
    organizationId,
    userId,
    `Website: ${crawl.hostname}`.slice(0, 100),
    `Auto-imported from ${crawl.url} (${crawl.pagesCrawled} pages)`.slice(0, 500),
  );
  await addDocument({
    organizationId,
    userId,
    knowledgeBaseId: kb.id,
    name: `${crawl.hostname} — website content`.slice(0, 120),
    sourceType: "website",
    content: `Source: ${crawl.url}\n${crawl.title}\n${crawl.description}\n\n${crawl.text}`.slice(0, 200_000),
  });

  const agent = await createAgent(organizationId, userId, {
    name: generated.agentName,
    description: generated.description,
    businessDescription: generated.businessDescription,
    personality: generated.personality,
    tone: generated.tone,
    language: generated.language,
    goal: generated.goal,
    systemInstructions: generated.systemInstructions,
    rules: generated.rules,
    prohibitedActions: generated.prohibitedActions,
    escalationRules: generated.escalationRules,
    fallbackResponse: generated.fallbackResponse,
    status: "DRAFT",
    enabledTools: ["search_knowledge", "create_lead", "transfer_to_human"],
    knowledgeBaseIds: [kb.id],
  });

  await db.agent.update({
    where: { id: agent.id },
    data: { description: generated.description },
  });

  return { agent, knowledgeBaseId: kb.id, pagesCrawled: crawl.pagesCrawled, hostname: crawl.hostname };
}
