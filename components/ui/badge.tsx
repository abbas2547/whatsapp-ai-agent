import { Inbox, SearchX, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & {
  variant?: "default" | "secondary" | "outline" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-tight whitespace-nowrap",
        variant === "default" && "bg-primary/10 text-primary",
        variant === "secondary" && "bg-muted text-muted-foreground",
        variant === "outline" && "border border-border text-muted-foreground",
        variant === "success" && "bg-[var(--success-bg)] text-emerald-700 dark:text-emerald-300",
        variant === "warning" && "bg-[var(--warning-bg)] text-amber-700 dark:text-amber-300",
        variant === "danger" && "bg-[var(--destructive-bg)] text-red-700 dark:text-red-300",
        variant === "info" && "bg-[var(--info-bg)] text-sky-700 dark:text-sky-300",
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("skeleton-shimmer rounded-lg", className)} aria-hidden {...props} />;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 text-center",
        compact ? "p-8" : "p-12",
      )}
      role="status"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
        <Icon className="h-5 w-5 text-primary" aria-hidden />
      </span>
      <h3 className="mt-4 text-base font-semibold tracking-tight">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function SearchEmptyState({ query, onClear }: { query?: string; onClear?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-10 text-center">
      <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden />
      <h3 className="mt-3 text-sm font-semibold">No results found{query ? ` for “${query}”` : ""}</h3>
      <p className="mt-1 text-sm text-muted-foreground">Try a different search or clear the filters.</p>
      {onClear ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={onClear}>
          Clear search
        </Button>
      ) : (
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <Link href="?">Clear search</Link>
        </Button>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-balance">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
