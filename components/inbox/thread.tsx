"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  pauseAiAction,
  resolveConversationAction,
  returnToAiAction,
  sendInboxMessageAction,
  transferConversationAction,
} from "@/app/actions/inbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot, BotOff, UserPlus, CheckCircle2, Loader2 } from "lucide-react";

type Status = "AI_ACTIVE" | "WAITING_FOR_HUMAN" | "HUMAN_ACTIVE" | "RESOLVED";

type OptimisticMsg = { id: string; content: string; pending: boolean };

export function ConversationThread({
  conversationId,
  aiEnabled,
  status,
}: {
  conversationId: string;
  aiEnabled: boolean;
  status: Status;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [pending, startTransition] = useTransition();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimisticMsgs, addOptimistic] = useOptimistic<OptimisticMsg[], string>(
    [],
    (state, content: string) => [...state, { id: `tmp-${Date.now()}`, content, pending: true }],
  );

  const refresh = () => startTransition(() => router.refresh());

  async function send() {
    const content = text.trim();
    if (!content || sending) return;
    setError(null);
    setSending(true);
    addOptimistic(content);
    setText("");
    const result = await sendInboxMessageAction(conversationId, content);
    setSending(false);
    if (result.ok) {
      toast.success("Message sent");
      refresh();
    } else {
      setError(result.error);
      toast.error(result.error);
    }
  }

  async function toggleAi() {
    const result = await pauseAiAction(conversationId, !aiEnabled);
    if (!result.ok) {
      setError(result.error);
      toast.error(result.error);
    } else {
      toast.success(aiEnabled ? "AI paused — you are in control" : "AI resumed");
    }
    refresh();
  }

  async function resolve() {
    const result = await resolveConversationAction(conversationId);
    if (!result.ok) {
      setError(result.error);
      toast.error(result.error);
    } else {
      toast.success("Conversation resolved");
    }
    refresh();
  }

  async function returnToAi() {
    const result = await returnToAiAction(conversationId);
    if (!result.ok) {
      setError(result.error);
      toast.error(result.error);
    } else {
      toast.success("Returned to AI");
    }
    refresh();
  }

  async function transfer() {
    if (!reason.trim()) {
      setTransferring(true);
      return;
    }
    const result = await transferConversationAction(conversationId, reason.trim());
    if (!result.ok) {
      setError(result.error);
      toast.error(result.error);
    } else {
      toast.success("Transferred to human");
    }
    setReason("");
    setTransferring(false);
    refresh();
  }

  const resolved = status === "RESOLVED";

  return (
    <div className="border-t border-border bg-card p-3">
      {/* Optimistic pending messages */}
      {optimisticMsgs.length > 0 && (
        <div className="mb-2 flex flex-col gap-1.5" aria-live="polite">
          {optimisticMsgs.map((m) => (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-md bg-[#d9fdd3] px-3.5 py-2 text-sm text-gray-900 opacity-70 dark:bg-emerald-900 dark:text-emerald-50">
                <p className="whitespace-pre-wrap">{m.content}</p>
                <p className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-60">
                  <Loader2 className="h-3 w-3 animate-spin" /> Sending…
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {transferring ? (
        <div className="mb-2 flex gap-2 animate-pop-in">
          <Input
            placeholder="Why transfer to a teammate?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") transfer();
              if (e.key === "Escape") setTransferring(false);
            }}
            autoFocus
            aria-label="Transfer reason"
          />
          <Button onClick={transfer} disabled={!reason.trim()} size="sm" loading={pending}>
            Send
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setTransferring(false)}>
            Cancel
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className="mb-2 text-xs font-medium text-red-600 dark:text-red-400" role="alert">{error}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex min-w-52 flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Input
            placeholder={resolved ? "Conversation resolved" : "Type a reply… (Enter to send)"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={resolved || sending}
            className="flex-1"
            aria-label="Reply message"
            maxLength={4096}
          />
          <Button type="submit" size="icon" disabled={!text.trim() || resolved || sending} title="Send" aria-label="Send message" loading={sending}>
            {!sending && <Send className="h-4 w-4" />}
          </Button>
        </form>
        {aiEnabled ? (
          <Button variant="outline" size="sm" onClick={toggleAi} disabled={resolved || pending} title="Pause AI and take over">
            <BotOff /> Pause AI
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={returnToAi} disabled={resolved || status === "WAITING_FOR_HUMAN" || pending} title="Return to AI">
            <Bot /> Return to AI
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={transfer} disabled={resolved || pending}>
          <UserPlus /> Transfer
        </Button>
        <Button variant="ghost" size="sm" onClick={resolve} disabled={resolved || pending}>
          <CheckCircle2 /> Resolve
        </Button>
      </div>
      {pending ? <p className="mt-2 text-xs text-muted-foreground" role="status">Refreshing…</p> : null}
    </div>
  );
}
