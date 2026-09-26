"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { testAgentAction } from "@/app/actions/agents";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type HistoryItem = { role: "user" | "assistant"; content: string; ms?: number; tools?: string[] };

export function AgentTester({ agentId, compact = false }: { agentId: string; compact?: boolean }) {
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    if (!message.trim() || pending) return;
    const outgoing = message.trim();
    startTransition(async () => {
      const result = await testAgentAction(agentId, outgoing, history.map((h) => ({ role: h.role, content: h.content })));
      if (result.ok) {
        const tools = Array.isArray((result as { toolCalls?: Array<{ name: string }> }).toolCalls)
          ? (result as { toolCalls: Array<{ name: string }> }).toolCalls.map((t) => t.name)
          : [];
        setHistory((h) => [...h, { role: "user", content: outgoing }, { role: "assistant", content: result.reply, ms: result.responseTimeMs, tools }]);
        setResponseTime(result.responseTimeMs);
        setMessage("");
        if (result.error) toast.error(`Turn finished with error: ${result.error}`);
      } else {
        toast.error(result.error);
      }
    });
  }

  const body = (
    <>
      <div className="wa-chat-bg flex max-h-80 min-h-48 flex-col gap-1.5 overflow-y-auto rounded-xl border border-border p-3" aria-live="polite">
        {history.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Talk to the agent before publishing. Messages call the real configured AI provider.
          </p>
        )}
        {history.map((h, i) => (
          <div key={i} className={h.role === "user" ? "flex justify-end animate-msg-in" : "flex justify-start animate-msg-in"}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-1.5 text-xs shadow-sm",
                h.role === "user"
                  ? "rounded-br-md bg-[#d9fdd3] text-gray-900 dark:bg-emerald-900 dark:text-emerald-50"
                  : "rounded-bl-md bg-white text-gray-900 dark:bg-zinc-800 dark:text-zinc-50",
              )}
            >
              <p className="whitespace-pre-wrap break-words leading-5">{h.content}</p>
              {h.ms != null && h.role === "assistant" && (
                <p className="mt-1 text-[10px] tabular-nums opacity-60">
                  {h.ms} ms{h.tools?.length ? ` · ${h.tools.length} tool${h.tools.length === 1 ? "" : "s"}` : ""}
                </p>
              )}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 shadow-sm dark:bg-zinc-800" role="status" aria-label="Agent is thinking">
              {[0, 1, 2].map((d) => (
                <span key={d} className="h-1.5 w-1.5 rounded-full bg-muted-foreground" style={{ animation: `typing-dot 1.2s infinite ${d * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Send a test message…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          aria-label="Test message"
        />
        <Button onClick={send} disabled={pending || !message.trim()} loading={pending} aria-label="Send test message" size="icon">
          {!pending && <Send className="h-4 w-4" />}
        </Button>
      </div>
      {responseTime != null && !compact && (
        <p className="text-xs tabular-nums text-muted-foreground">Last reply in {responseTime} ms</p>
      )}
    </>
  );

  if (compact) return <div className="flex flex-col gap-2.5">{body}</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live test chat</CardTitle>
        <CardDescription>Talk to the agent before publishing. Calls the real AI provider.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{body}</CardContent>
    </Card>
  );
}
