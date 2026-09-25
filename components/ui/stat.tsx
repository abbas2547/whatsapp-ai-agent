import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  href,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: LucideIcon;
  href?: string;
  tone?: "default" | "green" | "amber" | "red" | "blue";
}) {
  const toneClass =
    tone === "green"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : tone === "amber"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : tone === "red"
          ? "bg-red-500/10 text-red-600 dark:text-red-400"
          : tone === "blue"
            ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
            : "bg-primary/10 text-primary";
  const inner = (
    <Card className={cn("card-elevated h-full", href && "transition-transform hover:-translate-y-0.5")}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
          <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl", toneClass)}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        </div>
        <p className="mt-2 text-[28px] font-semibold leading-none tracking-tight tabular-nums">{value}</p>
        {sub ? <div className="mt-2 text-xs leading-5 text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
  if (href) {
    return (
      <Link href={href} className="h-full" prefetch>
        {inner}
      </Link>
    );
  }
  return inner;
}

export function Pagination({
  page,
  hasMore,
  baseHref,
}: {
  page: number;
  hasMore: boolean;
  baseHref: string;
}) {
  const sep = baseHref.includes("?") ? "&" : "?";
  return (
    <div className="flex items-center justify-between pt-1 text-sm">
      <p className="text-xs text-muted-foreground">Page {page}</p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link
            href={`${baseHref}${sep}page=${page - 1}`}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted"
          >
            Previous
          </Link>
        ) : null}
        {hasMore ? (
          <Link
            href={`${baseHref}${sep}page=${page + 1}`}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-[var(--primary-hover)]"
          >
            Next
          </Link>
        ) : null}
      </div>
    </div>
  );
}
