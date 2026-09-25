import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireSessionOrRedirect } from "@/app/actions";
import { getConversation, markConversationRead } from "@/services/inbox/conversation.service";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/badge";
import { ConversationStatusBadge } from "@/components/status-badges";
import { fmtDateTime, relTime } from "@/components/format";
import { ConversationThread } from "@/components/inbox/thread";
import { ArrowLeft, CheckCheck, Check, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const orgId = session.user.organizationId!;
  const { id } = await params;

  const conversation = await getConversation(orgId, id, 50).catch(() => null);
  if (!conversation) notFound();

  // Mark read without blocking render of the thread.
  markConversationRead(orgId, conversation.id).catch(() => {});

  const lead = conversation.contact.leads[0];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Link href="/inbox" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to inbox
      </Link>

      <Card className="grid gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-h-0 flex-col">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {(conversation.contact.name || conversation.contact.phone || "?").slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{conversation.contact.name || conversation.contact.phone}</p>
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" /> {conversation.contact.phone}
                  {conversation.phoneNumber ? ` · ${conversation.phoneNumber.displayPhoneNumber}` : ""}
                </p>
              </div>
            </div>
            <ConversationStatusBadge status={conversation.status} />
          </div>

          {conversation.status === "HUMAN_ACTIVE" || conversation.status === "WAITING_FOR_HUMAN" ? (
            <p className="border-b border-amber-500/20 bg-amber-500/[0.07] px-4 py-2 text-center text-xs font-medium text-amber-700 dark:text-amber-300" role="status">
              Human agent is handling this conversation — AI auto-reply is paused.
            </p>
          ) : null}

          {/* Messages — WhatsApp style */}
          <Suspense fallback={<ThreadSkeleton />}>
            <div className="wa-chat-bg flex max-h-[60vh] min-h-[420px] flex-col gap-1.5 overflow-y-auto p-4" aria-live="polite">
              {conversation.messages.length ? (
                conversation.messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">No messages yet.</p>
              )}
            </div>
          </Suspense>

          <ConversationThread
            conversationId={conversation.id}
            aiEnabled={conversation.aiEnabled}
            status={conversation.status}
          />
        </div>

        {/* Context panel */}
        <aside className="flex flex-col gap-4 border-t border-border bg-muted/30 p-4 lg:border-l lg:border-t-0">
          <Section label="Contact">
            <p className="text-sm font-medium">{conversation.contact.name || "—"}</p>
            <p className="text-[13px] text-muted-foreground">{conversation.contact.phone}</p>
            {conversation.contact.tags.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {conversation.contact.tags.map((t) => (
                  <Badge key={t.tagId} variant="outline">{t.tag.name}</Badge>
                ))}
              </div>
            ) : null}
          </Section>
          {lead ? (
            <Section label="Lead">
              <p className="text-sm font-medium capitalize">{lead.status.replaceAll("_", " ").toLowerCase()}</p>
              {lead.service ? <p className="text-[13px] text-muted-foreground">{lead.service}</p> : null}
            </Section>
          ) : null}
          <Section label="Assigned to">
            <p className="text-sm">{conversation.assignedUser?.name || conversation.assignedUser?.email || "No one"}</p>
          </Section>
          <Section label="AI agent">
            <p className="text-sm">{conversation.activeAgent?.name || "None"}</p>
          </Section>
          <Section label="Last activity">
            <p className="text-sm tabular-nums">{relTime(conversation.lastMessageAt)}</p>
          </Section>
          {conversation.priority !== "NORMAL" ? (
            <Section label="Priority">
              <Badge variant="warning">{conversation.priority}</Badge>
            </Section>
          ) : null}
          {conversation.takeoverReason ? (
            <Section label="Handoff reason">
              <p className="text-[13px] leading-5 text-muted-foreground">{conversation.takeoverReason}</p>
            </Section>
          ) : null}
          <Button asChild variant="outline" size="sm" className="mt-auto">
            <Link href={`/contacts/${conversation.contactId}`}>Open contact</Link>
          </Button>
        </aside>
      </Card>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function MessageBubble({ message }: { message: { id: string; senderType: string; content: string | null; createdAt: Date; status?: string } }) {
  const own = message.senderType === "HUMAN" || message.senderType === "AI";
  return (
    <div className={own ? "flex justify-end animate-msg-in" : "flex justify-start animate-msg-in"}>
      <div
        className={cn(
          "max-w-[82%] rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[75%]",
          own
            ? "rounded-br-md bg-[#d9fdd3] text-gray-900 dark:bg-emerald-900 dark:text-emerald-50"
            : "rounded-bl-md bg-white text-gray-900 dark:bg-zinc-800 dark:text-zinc-50",
        )}
      >
        {message.senderType === "AI" ? (
          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">AI</p>
        ) : null}
        {message.senderType === "SYSTEM" ? (
          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide opacity-70">System</p>
        ) : null}
        <p className="whitespace-pre-wrap break-words leading-6">{message.content || "(media message)"}</p>
        <p className="mt-1 flex items-center justify-end gap-1 text-[10px] tabular-nums opacity-60">
          {fmtDateTime(message.createdAt)}
          {own && message.status === "READ" ? <CheckCheck className="h-3 w-3 text-sky-500" /> : own ? <Check className="h-3 w-3" /> : null}
        </p>
      </div>
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="flex min-h-[420px] flex-col gap-2 p-4">
      <Skeleton className="h-14 w-3/4" />
      <Skeleton className="ml-auto h-14 w-2/3" />
      <Skeleton className="h-14 w-3/5" />
      <Skeleton className="ml-auto h-14 w-1/2" />
    </div>
  );
}
