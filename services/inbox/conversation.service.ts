import { ConversationStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export type InboxFilter =
  | "all"
  | "unread"
  | "ai"
  | "human"
  | "assigned"
  | "leads"
  | "priority";

export const INBOX_PAGE_SIZE = 30;
export const MESSAGE_PAGE_SIZE = 50;

export async function listConversations(
  organizationId: string,
  userId: string,
  filter: InboxFilter,
  query?: string,
  page = 1,
) {
  const where: Prisma.ConversationWhereInput = { organizationId };
  if (filter === "unread") where.unreadCount = { gt: 0 };
  if (filter === "ai") where.status = "AI_ACTIVE";
  if (filter === "human") where.status = { in: ["HUMAN_ACTIVE", "WAITING_FOR_HUMAN"] };
  if (filter === "assigned") where.assignedUserId = userId;
  if (filter === "leads") where.leads = { some: {} };
  if (filter === "priority") where.priority = { in: ["HIGH", "URGENT"] };
  if (query) {
    where.OR = [
      { contact: { name: { contains: query, mode: "insensitive" } } },
      { contact: { phone: { contains: query } } },
    ];
  }
  return db.conversation.findMany({
    where,
    select: {
      id: true,
      status: true,
      priority: true,
      unreadCount: true,
      lastMessageAt: true,
      updatedAt: true,
      contact: { select: { id: true, name: true, phone: true } },
      messages: { select: { id: true, content: true, senderType: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      assignedUser: { select: { id: true, name: true, email: true } },
      activeAgent: { select: { id: true, name: true } },
    },
    orderBy: { lastMessageAt: "desc" },
    take: INBOX_PAGE_SIZE,
    skip: (Math.max(1, page) - 1) * INBOX_PAGE_SIZE,
  });
}

export async function countConversations(organizationId: string, userId: string, filter: InboxFilter, query?: string) {
  const where: Prisma.ConversationWhereInput = { organizationId };
  if (filter === "unread") where.unreadCount = { gt: 0 };
  if (filter === "ai") where.status = "AI_ACTIVE";
  if (filter === "human") where.status = { in: ["HUMAN_ACTIVE", "WAITING_FOR_HUMAN"] };
  if (filter === "assigned") where.assignedUserId = userId;
  if (filter === "leads") where.leads = { some: {} };
  if (filter === "priority") where.priority = { in: ["HIGH", "URGENT"] };
  if (query) {
    where.OR = [
      { contact: { name: { contains: query, mode: "insensitive" } } },
      { contact: { phone: { contains: query } } },
    ];
  }
  return db.conversation.count({ where });
}

export async function getConversation(organizationId: string, id: string, messageLimit = MESSAGE_PAGE_SIZE) {
  const conversation = await db.conversation.findFirst({
    where: { id, organizationId },
    include: {
      contact: { include: { tags: { include: { tag: true } }, leads: { orderBy: { createdAt: "desc" }, take: 3 } } },
      messages: { orderBy: { createdAt: "desc" }, take: messageLimit },
      assignedUser: { select: { id: true, name: true, email: true } },
      activeAgent: { select: { id: true, name: true } },
      appointments: { orderBy: { startAt: "desc" }, take: 5 },
      phoneNumber: { select: { id: true, displayPhoneNumber: true, verifiedName: true } },
    },
  });
  if (!conversation) throw new AppError("Conversation not found", "NOT_FOUND", 404);
  // Return messages oldest-first for rendering while querying newest-first for pagination.
  return { ...conversation, messages: [...conversation.messages].reverse() };
}

export async function getConversationMessages(organizationId: string, conversationId: string, cursor?: string, limit = MESSAGE_PAGE_SIZE) {
  // Verify ownership first (never leak cross-workspace messages).
  const owned = await db.conversation.findFirst({
    where: { id: conversationId, organizationId },
    select: { id: true },
  });
  if (!owned) throw new AppError("Conversation not found", "NOT_FOUND", 404);
  const messages = await db.message.findMany({
    where: { conversationId, organizationId, ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
  return [...messages].reverse();
}

export async function setConversationAi(organizationId: string, id: string, enabled: boolean) {
  return db.conversation.updateMany({
    where: { id, organizationId },
    data: {
      aiEnabled: enabled,
      status: enabled ? "AI_ACTIVE" : "HUMAN_ACTIVE",
    },
  });
}

export async function markConversationRead(organizationId: string, id: string) {
  await db.conversation.updateMany({
    where: { id, organizationId },
    data: { unreadCount: 0 },
  });
}

export async function updateConversationStatus(organizationId: string, id: string, status: ConversationStatus) {
  return db.conversation.updateMany({
    where: { id, organizationId },
    data: { status, aiEnabled: status === "AI_ACTIVE" },
  });
}
