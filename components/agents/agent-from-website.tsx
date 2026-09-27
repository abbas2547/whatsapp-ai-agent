"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, Globe, Loader2, Sparkles } from "lucide-react";
import { createAgentFromWebsiteAction } from "@/app/actions/agents";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STAGES = ["Reading your website", "Understanding your business", "Training your agent"] as const;

export function AgentFromWebsite() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; name: string; pages: number } | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || pending) return;
    setError(null);
    setCreated(null);
    setStage(0);
    startTransition(async () => {
      // Animated progress through the stages while the server works.
      const timer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 4000);
      try {
        const result = await createAgentFromWebsiteAction(url.trim());
        clearInterval(timer);
        if (result.ok) {
          setCreated({ id: result.agentId, name: result.agentName, pages: result.pagesCrawled });
          toast.success(`Agent "${result.agentName}" created from your website`);
          router.refresh();
        } else {
          setError(result.error);
          toast.error(result.error);
        }
      } catch {
        clearInterval(timer);
        setError("Something went wrong while reading your website. Please try again.");
      }
    });
  }

  const valid = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+/.test(url.trim());

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.07] via-card to-emerald-500/[0.05]">
      <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
            <Globe className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold tracking-tight">
              Create from website
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                <Sparkles className="h-3 w-3" /> Fastest
              </span>
            </p>
            <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
              Paste your business website URL — we read your full site and build a trained WhatsApp agent
              automatically. No manual forms needed.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-2.5 sm:flex-row">
          <div className="min-w-0 flex-1">
            <Label htmlFor="agent-website-url" className="sr-only">
              Business website URL
            </Label>
            <Input
              id="agent-website-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourbusiness.com"
              inputMode="url"
              autoComplete="url"
              disabled={pending}
              className="h-11 bg-background"
            />
          </div>
          <Button type="submit" size="lg" loading={pending} disabled={!valid || pending} className="shrink-0">
            {pending ? "Building…" : (<><Sparkles /> Build my agent</>)}
          </Button>
        </form>

        {pending ? (
          <ol className="flex flex-col gap-2" aria-live="polite">
            {STAGES.map((label, i) => {
              const active = i === stage;
              const done = i < stage;
              return (
                <li key={label} className="flex items-center gap-2.5 text-[13px]">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold",
                      done
                        ? "bg-emerald-500 text-white"
                        : active
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : i + 1}
                  </span>
                  <span className={active || done ? "font-semibold" : "text-muted-foreground"}>{label}…</span>
                </li>
              );
            })}
          </ol>
        ) : null}

        {error && !pending ? (
          <p className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3 text-[13px] font-medium text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        {created && !pending ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4" role="status">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white">
              <Check className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">“{created.name}” is ready</p>
              <p className="text-xs text-muted-foreground">Trained on {created.pages} website page{created.pages === 1 ? "" : "s"} · review & publish when ready.</p>
            </div>
            <Button asChild size="sm">
              <Link href={`/agents/${created.id}`}>
                Open agent <ArrowRight />
              </Link>
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>✓ Business info auto-filled</span>
          <span>✓ FAQs imported as knowledge</span>
          <span>✓ WhatsApp-ready instructions</span>
        </div>
      </CardContent>
    </Card>
  );
}
