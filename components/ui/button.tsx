import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-[var(--primary-hover)] hover:shadow-md",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70 border border-border/60",
        outline: "border border-border bg-card hover:bg-muted hover:border-muted-foreground/30 shadow-sm",
        ghost: "hover:bg-muted hover:text-foreground",
        destructive:
          "bg-destructive text-white shadow-sm hover:bg-destructive/90 hover:shadow-md",
        success:
          "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 hover:shadow-md",
        subtle: "bg-primary/10 text-primary hover:bg-primary/15",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs rounded-lg",
        lg: "h-11 px-6 text-[15px] rounded-xl",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8 rounded-lg",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean }) {
  // NOTE: Radix Slot requires exactly ONE element child. Never render the
  // loading spinner as a sibling when asChild is true — that throws
  // "Slot failed to slot onto its children".
  if (asChild) {
    return (
      <Slot className={cn(buttonVariants({ variant, size, className }))} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={loading || props.disabled}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export { buttonVariants };
