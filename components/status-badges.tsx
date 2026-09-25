import { Badge } from "@/components/ui/badge";
import {
  AgentStatus,
  AppointmentStatus,
  ConversationStatus,
  DocumentStatus,
  LeadStatus,
  MessageDirection,
  MessageStatus,
  SenderType,
} from "@prisma/client";

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const map: Record<AgentStatus, { label: string; variant: "default" | "secondary" | "success" | "warning" }> = {
    DRAFT: { label: "Draft", variant: "secondary" },
    TESTING: { label: "Testing", variant: "warning" },
    ACTIVE: { label: "Active", variant: "success" },
    PAUSED: { label: "Paused", variant: "secondary" },
  };
  const item = map[status];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

export function ConversationStatusBadge({ status }: { status: ConversationStatus }) {
  const map: Record<ConversationStatus, { label: string; variant: "default" | "secondary" | "success" | "warning" }> = {
    AI_ACTIVE: { label: "AI active", variant: "success" },
    WAITING_FOR_HUMAN: { label: "Needs human", variant: "warning" },
    HUMAN_ACTIVE: { label: "Human active", variant: "default" },
    RESOLVED: { label: "Resolved", variant: "secondary" },
  };
  const item = map[status];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const map: Record<LeadStatus, "default" | "secondary" | "success" | "warning"> = {
    NEW: "secondary",
    CONTACTED: "default",
    QUALIFIED: "warning",
    PROPOSAL: "warning",
    WON: "success",
    LOST: "secondary",
  };
  return <Badge variant={map[status]}>{status.replaceAll("_", " ")}</Badge>;
}

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const map: Record<AppointmentStatus, "default" | "secondary" | "success" | "warning"> = {
    PROPOSED: "warning",
    CONFIRMED: "success",
    CANCELLED: "secondary",
    COMPLETED: "default",
  };
  return <Badge variant={map[status]}>{status}</Badge>;
}

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const map: Record<DocumentStatus, "default" | "secondary" | "success" | "warning"> = {
    UPLOADING: "secondary",
    PROCESSING: "warning",
    READY: "success",
    FAILED: "secondary",
  };
  return <Badge variant={map[status]}>{status}</Badge>;
}

export function MessageStatusBadge({ status }: { status: MessageStatus }) {
  const map: Record<MessageStatus, "default" | "secondary" | "success" | "warning"> = {
    PENDING: "secondary",
    SENT: "default",
    DELIVERED: "default",
    READ: "success",
    FAILED: "secondary",
  };
  return <Badge variant={map[status]}>{status}</Badge>;
}

export function senderLabel(senderType: SenderType) {
  const map: Record<SenderType, string> = {
    CUSTOMER: "Customer",
    AI: "AI",
    HUMAN: "You",
    SYSTEM: "System",
  };
  return map[senderType];
}

export function directionLabel(direction: MessageDirection) {
  return direction === "INBOUND" ? "Inbound" : "Outbound";
}