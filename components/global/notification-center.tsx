"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { relTime } from "@/components/format";

type Item = { id: string; type: string; title: string; body: string; read: boolean; createdAt: string };

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const r = await fetch("/api/notifications", { cache: "no-store" });
        if (r.ok && !cancelled) {
          const j = await r.json();
          setItems(j.items || []);
          setUnread(j.unread || 0);
        }
      } catch { /* offline */ }
    }
    check();
    const t = setInterval(check, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  async function load() {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        setItems(j.items || []);
        setUnread(j.unread || 0);
      }
    } catch { /* offline */ }
  }

  async function markAll() {
    await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true }) });
    setItems((xs) => xs.map((x) => ({ ...x, read: true })));
    setUnread(0);
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); load(); }}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
        aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Notifications{unread > 0 ? ` (${unread} unread)` : ""}</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto">
            {items.length ? items.map((n) => (
              <div key={n.id} className={`rounded-xl border border-border p-3 text-sm ${n.read ? "" : "bg-primary/[0.04]"}`}>
                <p className="font-semibold">{n.title}</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{n.type} · {relTime(n.createdAt)}</p>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <Bell className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-2 text-sm font-semibold">You&apos;re all caught up</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Leads, handoffs and system alerts will appear here.</p>
                <Button variant="outline" size="sm" className="mt-3" asChild><Link href="/inbox" onClick={() => setOpen(false)}>Open inbox</Link></Button>
              </div>
            )}
          </div>
          {unread > 0 && <Button variant="outline" size="sm" onClick={markAll}>Mark all as read</Button>}
        </DialogContent>
      </Dialog>
    </>
  );
}
