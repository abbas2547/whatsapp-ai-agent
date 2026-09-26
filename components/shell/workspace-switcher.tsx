"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Bot, Check, ChevronDown, Plus, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createAdditionalWorkspaceAction, switchWorkspaceAction } from "@/app/actions/workspaces";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type WorkspaceItem = { id: string; name: string; slug: string; role: string };

export function WorkspaceSwitcher({
  workspaces,
  activeId,
  collapsed = false,
  onExpand,
  onNavigate,
}: {
  workspaces: WorkspaceItem[];
  activeId: string;
  collapsed?: boolean;
  onExpand?: () => void;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const { update } = useSession();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const active = workspaces.find((w) => w.id === activeId) || workspaces[0];

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  function switchTo(id: string) {
    if (id === activeId || pending) return;
    startTransition(async () => {
      const result = await switchWorkspaceAction(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // Server verified membership; refresh JWT then reload under the new org.
      await update({ organizationId: id }).catch(() => undefined);
      toast.success("Workspace switched");
      setOpen(false);
      onNavigate?.();
      router.replace("/dashboard");
      router.refresh();
    });
  }

  function create() {
    if (name.trim().length < 2 || pending) return;
    startTransition(async () => {
      const result = await createAdditionalWorkspaceAction(name.trim());
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await update({ organizationId: result.organizationId }).catch(() => undefined);
      toast.success("Workspace created");
      setOpen(false);
      setCreating(false);
      setName("");
      onNavigate?.();
      router.replace("/onboarding");
      router.refresh();
    });
  }

  if (collapsed) {
    return (
      <button
        onClick={onExpand}
        title={active?.name || "Workspaces"}
        aria-label="Expand sidebar to switch workspaces"
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-sm font-bold text-white shadow-sm transition-transform hover:scale-105"
      >
        {(active?.name || "W").slice(0, 1).toUpperCase()}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition-colors hover:bg-muted"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-sm">
          <Bot className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-semibold tracking-tight">{active?.name || "Workspace"}</span>
          <span className="block text-[11px] text-muted-foreground">WhatsApp AI Employee</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-64 animate-pop-in rounded-2xl border border-border bg-popover p-1.5 shadow-xl" role="menu" aria-label="Workspaces">
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Your workspaces
          </p>
          <div className="max-h-56 overflow-y-auto">
            {workspaces.map((w) => {
              const isActive = w.id === activeId;
              return (
                <button
                  key={w.id}
                  onClick={() => switchTo(w.id)}
                  role="menuitemradio"
                  aria-checked={isActive}
                  disabled={pending}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors",
                    isActive ? "bg-primary/10" : "hover:bg-muted",
                  )}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] font-bold">
                    {w.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{w.name}</span>
                    <span className="block text-[11px] capitalize text-muted-foreground">{w.role.replaceAll("_", " ").toLowerCase()}</span>
                  </span>
                  {isActive && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>

          <div className="my-1.5 h-px bg-border" />

          {creating ? (
            <form
              className="flex gap-1.5 p-1"
              onSubmit={(e) => {
                e.preventDefault();
                create();
              }}
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="New workspace name"
                aria-label="New workspace name"
                autoFocus
                className="h-8 text-xs"
              />
              <Button size="sm" className="h-8 shrink-0" loading={pending} disabled={name.trim().length < 2}>
                Add
              </Button>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-4 w-4" /> Create workspace
            </button>
          )}
          <Link
            href="/settings"
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Settings2 className="h-4 w-4" /> Manage workspaces
          </Link>
        </div>
      )}
    </div>
  );
}
