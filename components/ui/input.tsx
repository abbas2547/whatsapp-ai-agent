import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-sm outline-none transition-all placeholder:text-muted-foreground hover:border-muted-foreground/30 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-24 w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm shadow-sm outline-none transition-all placeholder:text-muted-foreground hover:border-muted-foreground/30 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-[13px] font-semibold tracking-tight", className)} {...props} />;
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{children}</p>;
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400" role="alert">
      {children}
    </p>
  );
}

export function SearchInput({
  className,
  iconClassName,
  ...props
}: React.ComponentProps<"input"> & { iconClassName?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Search className={cn("pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground", iconClassName)} aria-hidden />
      <input
        className="flex h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm shadow-sm outline-none transition-all placeholder:text-muted-foreground hover:border-muted-foreground/30 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
        {...props}
      />
    </div>
  );
}
