import { db } from "@/lib/db";
import { presenceThresholdMs } from "@/lib/presence";

export async function getAdminOverview() {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const onlineSince = new Date(now - presenceThresholdMs());

  const [
    totalUsers,
    newToday,
    newWeek,
    onlineUsers,
    totalWorkspaces,
    suspendedWorkspaces,
    subs,
    paymentsToday,
    paymentsMonth,
    paySuccess,
    payFailed,
    payPending,
    waNumbers,
    waAccounts,
    activeAgents,
    aiConvs,
    aiMsgs,
    autoRuns,
    autoFailed,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: dayAgo } } }),
    db.user.count({ where: { createdAt: { gte: weekAgo } } }),
    db.user.count({ where: { lastSeenAt: { gte: onlineSince } } }),
    db.organization.count(),
    db.organization.count({ where: { suspendedAt: { not: null } } }),
    db.subscription.groupBy({ by: ["status"], _count: { status: true } }),
    db.payment.aggregate({ where: { createdAt: { gte: dayAgo }, status: "SUCCESS" }, _sum: { amountPaise: true } }),
    db.payment.aggregate({ where: { createdAt: { gte: monthAgo }, status: "SUCCESS" }, _sum: { amountPaise: true } }),
    db.payment.count({ where: { status: "SUCCESS" } }),
    db.payment.count({ where: { status: "FAILED" } }),
    db.payment.count({ where: { status: "PENDING" } }),
    db.whatsAppPhoneNumber.count(),
    db.whatsAppAccount.findMany({ select: { status: true, webhookVerified: true, updatedAt: true } }),
    db.agent.count({ where: { status: "ACTIVE" } }),
    db.conversation.count({ where: { status: "AI_ACTIVE" } }),
    db.message.count({ where: { senderType: "AI", createdAt: { gte: monthAgo } } }),
    db.workflowExecution.count({ where: { startedAt: { gte: monthAgo } } }),
    db.workflowExecution.count({ where: { status: "FAILED", startedAt: { gte: monthAgo } } }),
  ]);

  const planGroups = await db.subscription.groupBy({ by: ["planId"], _count: { planId: true } });
  const connectedWa = waAccounts.filter((a) => a.status === "connected").length;

  const [recentUsers, recentPayments, recentLogins, recentAudit] = await Promise.all([
    db.user.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { id: true, name: true, email: true, createdAt: true, lastSeenAt: true } }),
    db.payment.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { id: true, amountPaise: true, currency: true, status: true, planId: true, createdAt: true, organizationId: true } }),
    db.loginEvent.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { name: true, email: true } } } }),
    db.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  return {
    users: { total: totalUsers, newToday, newWeek, online: onlineUsers, offline: Math.max(0, totalUsers - onlineUsers) },
    workspaces: { total: totalWorkspaces, active: totalWorkspaces - suspendedWorkspaces, suspended: suspendedWorkspaces },
    subscriptions: { byStatus: subs, byPlan: planGroups },
    payments: {
      todayPaise: paymentsToday._sum.amountPaise ?? 0,
      monthPaise: paymentsMonth._sum.amountPaise ?? 0,
      success: paySuccess,
      failed: payFailed,
      pending: payPending,
    },
    whatsapp: { numbers: waNumbers, connected: connectedWa, disconnected: Math.max(0, waAccounts.length - connectedWa), accounts: waAccounts.length },
    ai: { activeAgents, aiConversations: aiConvs, aiMessages: aiMsgs },
    ops: { automationRuns: autoRuns, failedAutomations: autoFailed },
    recent: { users: recentUsers, payments: recentPayments, logins: recentLogins, audit: recentAudit },
  };
}

export function paiseToInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}
