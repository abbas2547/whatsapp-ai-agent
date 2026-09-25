import { db } from "@/lib/db";
import { getPlan, PLAN_RANK, type BillingInterval, type PlanDef, type PlanId } from "@/services/billing/plans";

/**
 * Centralized entitlement logic. UI and API routes must use these helpers —
 * never scatter `if (plan === "pro")` checks through the codebase.
 */

export interface ActiveSubscription {
  planId: PlanId;
  plan: PlanDef;
  status: string;
  effectiveStatus: "ACTIVE" | "EXPIRED" | "PENDING" | "CANCELED" | "PAST_DUE" | "PAUSED" | "FREE";
  billingInterval: BillingInterval | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export async function getActiveSubscription(organizationId: string): Promise<ActiveSubscription> {
  const freePlan = getPlan("free")!;
  const sub = await db.subscription.findUnique({ where: { organizationId } });
  if (!sub) {
    return {
      planId: "free",
      plan: freePlan,
      status: "FREE",
      effectiveStatus: "FREE",
      billingInterval: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }
  const plan = getPlan(sub.planId) ?? freePlan;
  const planId = (getPlan(sub.planId) ? sub.planId : "free") as PlanId;
  let effectiveStatus = sub.status as ActiveSubscription["effectiveStatus"];
  if (sub.status === "ACTIVE" && sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() < Date.now()) {
    effectiveStatus = "EXPIRED";
  }
  return {
    planId,
    plan,
    status: sub.status,
    effectiveStatus,
    billingInterval: sub.billingInterval === "annual" ? "annual" : sub.billingInterval === "monthly" ? "monthly" : null,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  };
}

export function isPaidActive(sub: ActiveSubscription): boolean {
  return sub.effectiveStatus === "ACTIVE" && sub.planId !== "free";
}

export interface UsageSummary {
  aiConversationsUsed: number;
  aiConversationsLimit: number;
  aiConversationsPct: number;
  contactsUsed: number;
  contactsLimit: number;
  contactsPct: number;
  agentsUsed: number;
  agentsLimit: number;
  agentsPct: number;
  numbersUsed: number;
  numbersLimit: number;
  numbersPct: number;
  periodStart: Date | null;
  periodEnd: Date | null;
}

function pct(used: number, limit: number): number {
  if (!limit || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 1000) / 10);
}

export async function getUsageSummary(organizationId: string): Promise<UsageSummary> {
  const sub = await getActiveSubscription(organizationId);
  const limit = sub.plan.limits;
  // Paid periods meter from the subscription period; free meters trailing 30d.
  const since =
    sub.currentPeriodStart && sub.effectiveStatus !== "FREE"
      ? sub.currentPeriodStart
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [aiConversationsUsed, contactsUsed, agentsUsed, numbersUsed] = await Promise.all([
    db.usageEvent.aggregate({
      where: { organizationId, type: "ai.handled", createdAt: { gte: since } },
      _sum: { quantity: true },
    }).then((r) => r._sum.quantity ?? 0),
    db.contact.count({ where: { organizationId } }),
    db.agent.count({ where: { organizationId } }),
    db.whatsAppPhoneNumber.count({ where: { organizationId } }),
  ]);
  return {
    aiConversationsUsed,
    aiConversationsLimit: limit.maxAIConversationsPerMonth,
    aiConversationsPct: pct(aiConversationsUsed, limit.maxAIConversationsPerMonth),
    contactsUsed,
    contactsLimit: limit.maxContacts,
    contactsPct: pct(contactsUsed, limit.maxContacts),
    agentsUsed,
    agentsLimit: limit.maxAgents,
    agentsPct: pct(agentsUsed, limit.maxAgents),
    numbersUsed,
    numbersLimit: limit.maxWhatsAppNumbers,
    numbersPct: pct(numbersUsed, limit.maxWhatsAppNumbers),
    periodStart: since,
    periodEnd: sub.currentPeriodEnd,
  };
}

export type PaidPlanId = Exclude<PlanId, "free">;

export type LimitCheck = { ok: true } | { ok: false; message: string; upgradePlan: PaidPlanId };

export async function canCreateAgent(organizationId: string): Promise<LimitCheck> {
  const [sub, count] = await Promise.all([
    getActiveSubscription(organizationId),
    db.agent.count({ where: { organizationId } }),
  ]);
  if (count < sub.plan.limits.maxAgents) return { ok: true };
  return {
    ok: false,
    message: `You've reached your AI Employee limit (${sub.plan.limits.maxAgents} on ${sub.plan.name}).`,
    upgradePlan: nextPlanUp(sub.planId),
  };
}

export async function canConnectWhatsAppNumber(organizationId: string): Promise<LimitCheck> {
  const [sub, count] = await Promise.all([
    getActiveSubscription(organizationId),
    db.whatsAppPhoneNumber.count({ where: { organizationId } }),
  ]);
  if (count < sub.plan.limits.maxWhatsAppNumbers) return { ok: true };
  return {
    ok: false,
    message: `You've reached your WhatsApp number limit (${sub.plan.limits.maxWhatsAppNumbers} on ${sub.plan.name}).`,
    upgradePlan: nextPlanUp(sub.planId),
  };
}

export async function aiConversationAllowance(organizationId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  pct: number;
  planId: PlanId;
}> {
  const usage = await getUsageSummary(organizationId);
  const sub = await getActiveSubscription(organizationId);
  return {
    allowed: usage.aiConversationsUsed < usage.aiConversationsLimit,
    used: usage.aiConversationsUsed,
    limit: usage.aiConversationsLimit,
    pct: usage.aiConversationsPct,
    planId: sub.planId,
  };
}

/** Next paid tier above the given plan (business stays business). */
export function nextPlanUp(planId: PlanId): PaidPlanId {
  const rank = PLAN_RANK[planId] ?? 0;
  if (rank <= 0) return "starter";
  if (rank === 1) return "pro";
  return "business";
}

/** Downgrade safety: target plan must fit current usage. */
export async function fitsPlan(
  organizationId: string,
  targetPlanId: PlanId,
): Promise<{ fits: true } | { fits: false; reason: string }> {
  const target = getPlan(targetPlanId);
  if (!target) return { fits: false, reason: "Unknown plan." };
  const usage = await getUsageSummary(organizationId);
  if (usage.agentsUsed > target.limits.maxAgents) {
    return { fits: false, reason: `You use ${usage.agentsUsed} AI Employees but ${target.name} allows ${target.limits.maxAgents}. Remove extras first.` };
  }
  if (usage.numbersUsed > target.limits.maxWhatsAppNumbers) {
    return { fits: false, reason: `You use ${usage.numbersUsed} WhatsApp numbers but ${target.name} allows ${target.limits.maxWhatsAppNumbers}.` };
  }
  if (usage.contactsUsed > target.limits.maxContacts) {
    return { fits: false, reason: `You have ${usage.contactsUsed.toLocaleString("en-IN")} contacts but ${target.name} allows ${target.limits.maxContacts.toLocaleString("en-IN")}.` };
  }
  return { fits: true };
}
