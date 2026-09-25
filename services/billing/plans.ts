/**
 * SINGLE SOURCE OF TRUTH for plans, prices and limits.
 *
 * Server-side only in authority (checkout, entitlements, billing UI all read
 * from here). Prices are integer paise — never floats. The UI never decides
 * prices; it renders what this module returns.
 */

export type BillingInterval = "monthly" | "annual";
export type PlanId = "free" | "starter" | "pro" | "business";

export interface PlanLimits {
  maxAgents: number;
  maxWhatsAppNumbers: number;
  maxAIConversationsPerMonth: number;
  maxContacts: number;
}

export interface PlanDef {
  id: PlanId;
  name: string;
  description: string;
  monthlyPaise: number;
  annualPaise: number;
  currency: "INR";
  popular?: boolean;
  features: string[];
  limits: PlanLimits;
  sortOrder: number;
}

export const PLANS: PlanDef[] = [
  {
    id: "free",
    name: "Free",
    description: "Explore the product with a real AI employee before upgrading.",
    monthlyPaise: 0,
    annualPaise: 0,
    currency: "INR",
    features: [
      "1 AI Employee",
      "1 WhatsApp number",
      "100 AI conversations/month",
      "Basic knowledge base",
      "Basic inbox",
      "Human handoff",
    ],
    limits: { maxAgents: 1, maxWhatsAppNumbers: 1, maxAIConversationsPerMonth: 100, maxContacts: 1000 },
    sortOrder: 0,
  },
  {
    id: "starter",
    name: "Starter",
    description: "Everything you need to start automating WhatsApp customer conversations.",
    monthlyPaise: 99900,
    annualPaise: 959000,
    currency: "INR",
    features: [
      "1 AI Employee",
      "1 WhatsApp number",
      "1,000 AI conversations/month",
      "2,000 contacts",
      "Knowledge base",
      "Basic automations",
      "Lead management",
      "Basic analytics",
      "Human handoff",
      "Email support",
    ],
    limits: { maxAgents: 1, maxWhatsAppNumbers: 1, maxAIConversationsPerMonth: 1000, maxContacts: 2000 },
    sortOrder: 1,
  },
  {
    id: "pro",
    name: "Pro",
    description: "Advanced AI automation for growing businesses.",
    monthlyPaise: 249900,
    annualPaise: 2399000,
    currency: "INR",
    popular: true,
    features: [
      "Up to 5 AI Employees",
      "Up to 3 WhatsApp numbers",
      "5,000 AI conversations/month",
      "10,000 contacts",
      "Advanced knowledge/RAG",
      "Advanced automations",
      "Lead qualification",
      "Calendar integration",
      "Human handoff",
      "Advanced analytics",
      "Priority support",
    ],
    limits: { maxAgents: 5, maxWhatsAppNumbers: 3, maxAIConversationsPerMonth: 5000, maxContacts: 10000 },
    sortOrder: 2,
  },
  {
    id: "business",
    name: "Business",
    description: "Powerful automation for teams and high-volume businesses.",
    monthlyPaise: 599900,
    annualPaise: 5759000,
    currency: "INR",
    features: [
      "Up to 15 AI Employees",
      "Up to 10 WhatsApp numbers",
      "20,000 AI conversations/month",
      "50,000 contacts",
      "Advanced RAG",
      "Unlimited automation workflows",
      "Advanced lead management",
      "Calendar + email integrations",
      "Team roles",
      "Audit logs",
      "Advanced analytics",
      "Priority support",
    ],
    limits: { maxAgents: 15, maxWhatsAppNumbers: 10, maxAIConversationsPerMonth: 20000, maxContacts: 50000 },
    sortOrder: 3,
  },
];

export const PLAN_RANK: Record<PlanId, number> = { free: 0, starter: 1, pro: 2, business: 3 };

export function getPlan(planId: string): PlanDef | null {
  const normalized = planId.toLowerCase().trim() as PlanId;
  return PLANS.find((p) => p.id === normalized) ?? null;
}

export function getPaidPlans(): PlanDef[] {
  return PLANS.filter((p) => p.id !== "free").sort((a, b) => a.sortOrder - b.sortOrder);
}

export function planPricePaise(plan: PlanDef, interval: BillingInterval): number {
  return interval === "annual" ? plan.annualPaise : plan.monthlyPaise;
}

/** Whole-rupee amount for Cashfree (all catalog prices are whole rupees). */
export function paiseToRupees(paise: number): number {
  if (!Number.isInteger(paise) || paise < 0) throw new Error("Invalid amount");
  return paise / 100;
}

export function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "monthly" || value === "annual";
}

export function annualSavingsPct(plan: PlanDef): number {
  const monthlyYear = plan.monthlyPaise * 12;
  if (!monthlyYear || !plan.annualPaise) return 0;
  return Math.round((1 - plan.annualPaise / monthlyYear) * 100);
}
