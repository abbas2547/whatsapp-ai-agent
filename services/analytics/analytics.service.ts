import { db } from "@/lib/db";

export async function getDashboardMetrics(organizationId: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [
    conversations,
    unread,
    leads,
    qualified,
    appointments,
    aiHandled,
    humanHandled,
    automations,
    recentConversations,
    recentLeads,
  ] = await Promise.all([
    db.conversation.count({ where: { organizationId } }),
    db.conversation.count({ where: { organizationId, unreadCount: { gt: 0 } } }),
    db.lead.count({ where: { organizationId } }),
    db.lead.count({ where: { organizationId, status: "QUALIFIED" } }),
    db.appointment.count({ where: { organizationId, startAt: { gte: new Date() } } }),
    db.message.count({ where: { organizationId, senderType: "AI", createdAt: { gte: since } } }),
    db.message.count({ where: { organizationId, senderType: "HUMAN", createdAt: { gte: since } } }),
    db.workflowExecution.count({ where: { organizationId, startedAt: { gte: since } } }),
    db.conversation.findMany({
      where: { organizationId },
      include: { contact: true, messages: { take: 1, orderBy: { createdAt: "desc" } } },
      orderBy: { lastMessageAt: "desc" },
      take: 6,
    }),
    db.lead.findMany({
      where: { organizationId },
      include: { contact: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  return {
    conversations,
    unread,
    leads,
    qualified,
    appointments,
    aiHandled,
    humanHandled,
    automations,
    recentConversations,
    recentLeads,
  };
}

export async function getRecentMessageVolume(organizationId: string, days = 14) {  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db.message.findMany({
    where: { organizationId, createdAt: { gte: since } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 1500,
  });
}

export async function getDashboardExtras(organizationId: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [pipeline, executions, sample] = await Promise.all([
    db.lead.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { status: true },
    }),
    db.workflowExecution.findMany({
      where: { organizationId },
      select: { id: true, status: true, trigger: true, startedAt: true, workflow: { select: { name: true } } },
      orderBy: { startedAt: "desc" },
      take: 5,
    }),
    db.message.findMany({
      where: { organizationId, createdAt: { gte: since } },
      select: { conversationId: true, senderType: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 1000,
    }),
  ]);

  const firstInbound = new Map<string, Date>();
  const firstOutbound = new Map<string, Date>();
  for (const m of sample) {
    if (m.senderType === "CUSTOMER" && !firstInbound.has(m.conversationId)) firstInbound.set(m.conversationId, m.createdAt);
    if ((m.senderType === "AI" || m.senderType === "HUMAN") && !firstOutbound.has(m.conversationId)) firstOutbound.set(m.conversationId, m.createdAt);
  }
  const deltas: number[] = [];
  for (const [id, inbound] of firstInbound) {
    const out = firstOutbound.get(id);
    if (out && out > inbound) deltas.push(out.getTime() - inbound.getTime());
  }
  const avgResponseMs = deltas.length ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : null;

  return { pipeline, executions, avgResponseMs };
}

export async function getAnalytics(organizationId: string, days = 30) {
  const range = [7, 30, 90].includes(days) ? days : 30;
  const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000);
  // `takeoverReason` may be missing on databases that haven't run the latest
  // migration — degrade to 0 instead of crashing the whole page.
  const handoffsPromise = db.conversation
    .count({ where: { organizationId, takeoverReason: { not: null } } })
    .catch((error) => {
      console.error("[analytics] handoffs query failed, defaulting to 0:", error instanceof Error ? error.message : "unknown");
      return 0;
    });
  const aiUsagePromise = db.usageEvent
    .aggregate({
      where: { organizationId, type: "ai.tokens", createdAt: { gte: since } },
      _sum: { quantity: true },
    })
    .catch((error) => {
      console.error("[analytics] usage query failed, defaulting to 0:", error instanceof Error ? error.message : "unknown");
      return { _sum: { quantity: 0 } };
    });
  const [
    received,
    sent,
    conversations,
    aiConversations,
    humanConversations,
    handoffs,
    leadsCreated,
    qualifiedLeads,
    appointments,
    workflowExecutions,
    workflowFailures,
    aiUsage,
    sampleMessages,
  ] = await Promise.all([
    db.message.count({ where: { organizationId, direction: "INBOUND", createdAt: { gte: since } } }),
    db.message.count({ where: { organizationId, direction: "OUTBOUND", createdAt: { gte: since } } }),
    db.conversation.count({ where: { organizationId } }),
    db.conversation.count({ where: { organizationId, status: "AI_ACTIVE" } }),
    db.conversation.count({ where: { organizationId, status: { in: ["HUMAN_ACTIVE", "WAITING_FOR_HUMAN"] } } }),
    handoffsPromise,
    db.lead.count({ where: { organizationId, createdAt: { gte: since } } }),
    db.lead.count({ where: { organizationId, status: "QUALIFIED" } }),
    db.appointment.count({ where: { organizationId } }),
    db.workflowExecution.count({ where: { organizationId, startedAt: { gte: since } } }),
    db.workflowExecution.count({ where: { organizationId, status: "FAILED", startedAt: { gte: since } } }),
    aiUsagePromise,
    db.message.findMany({
      where: { organizationId, createdAt: { gte: since } },
      select: { conversationId: true, senderType: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 2000,
    }),
  ]);

  const firstInbound = new Map<string, Date>();
  const firstOutbound = new Map<string, Date>();
  for (const message of sampleMessages) {
    if (message.senderType === "CUSTOMER" && !firstInbound.has(message.conversationId)) {
      firstInbound.set(message.conversationId, message.createdAt);
    }
    if ((message.senderType === "AI" || message.senderType === "HUMAN") && !firstOutbound.has(message.conversationId)) {
      firstOutbound.set(message.conversationId, message.createdAt);
    }
  }
  const deltas: number[] = [];
  for (const [id, inbound] of firstInbound) {
    const outbound = firstOutbound.get(id);
    if (outbound && outbound > inbound) deltas.push(outbound.getTime() - inbound.getTime());
  }
  const avgResponseMs = deltas.length ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : null;
  const insufficient = received + sent + conversations < 3;

  return {
    insufficient,
    range,
    received,
    sent,
    conversations,
    aiConversations,
    humanConversations,
    handoffRate: conversations ? Math.round((handoffs / conversations) * 100) : 0,
    leadsCreated,
    qualifiedLeads,
    appointments,
    avgResponseMs,
    workflowExecutions,
    workflowFailures,
    aiUsage: aiUsage._sum.quantity ?? 0,
  };
}
