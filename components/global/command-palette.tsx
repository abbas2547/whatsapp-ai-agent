"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useDebouncedValue } from "@/hooks/use-debounce";

type Hit = { kind: string; id: string; title: string; href: string };

const QUICK: Hit[] = [
  { kind: "go", id: "dashboard", title: "Go to Dashboard", href: "/dashboard" },
  { kind: "go", id: "inbox", title: "Go to Inbox", href: "/inbox" },
  { kind: "go", id: "agents", title: "Go to AI Agents", href: "/agents" },
  { kind: "go", id: "leads", title: "Go to Leads", href: "/leads" },
  { kind: "go", id: "automations", title: "Go to Automations", href: "/automations" },
  { kind: "go", id: "knowledge", title: "Go to Knowledge", href: "/knowledge" },
  { kind: "go", id: "settings", title: "Go to Settings", href: "/settings" },
];

/** CMD/CTRL+K palette backed by /api/search (debounced, min 2 chars). */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>(QUICK);
  const [busy, setBusy] = useState(false);
  const debounced = useDebouncedValue(q, 300);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function run() {
      const needle = debounced.trim();
      if (needle.length < 2) {
        if (!cancelled) setHits(QUICK.filter((h) => h.title.toLowerCase().includes(needle.toLowerCase())));
        return;
      }
      if (!cancelled) setBusy(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(needle)}`, { cache: "no-store" });
        const j = await r.json();
        if (!cancelled) setHits(r.ok ? (j.results as Hit[]) : []);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [debounced, open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[12%] max-w-lg translate-y-0 p-0">
        <DialogTitle className="sr-only">Global search</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search conversations, contacts, leads, agents…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Global search"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">ESC</kbd>
        </div>
        <div className="max-h-[320px] overflow-y-auto p-2">
          {busy ? <p className="px-3 py-4 text-center text-xs text-muted-foreground">Searching…</p>
          : hits.length ? hits.map((h) => (
            <Link key={`${h.kind}-${h.id}`} href={h.href} onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:bg-muted">
              <span className="truncate font-medium">{h.title}</span>
              <span className="ml-2 shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{h.kind}</span>
            </Link>
          )) : <p className="px-3 py-4 text-center text-xs text-muted-foreground">No results. Try at least 2 characters.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
