import Link from "next/link";
import { Bot } from "lucide-react";

/** Creative, frame-safe brand mark — safe-zone padded so it never clips on mobile/PWA. */
export function Logo({ size = 34, withWordmark = true }: { size?: number; withWordmark?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="eluue ai agent home">
      <span
        className="relative flex items-center justify-center overflow-hidden rounded-[28%] shadow-md shadow-emerald-900/20 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-105"
        style={{ width: size, height: size, background: "linear-gradient(135deg,#34d399 0%,#10b981 35%,#0d9488 65%,#047857 100%)" }}
      >
        {/* glossy sheen */}
        <span aria-hidden className="absolute inset-x-0 top-0 h-1/2 bg-white/25 blur-[1px]" style={{ borderRadius: "0 0 50% 50%" }} />
        {/* chat bubble */}
        <svg viewBox="0 0 32 32" width={size * 0.62} height={size * 0.62} aria-hidden>
          <path
            d="M6 7.5h20a2 2 0 0 1 2 2v9.2a2 2 0 0 1-2 2H17.4l-4.6 4.2a.8.8 0 0 1-1.4-.6V22.7H6a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2Z"
            fill="#fff"
          />
          <path
            d="M16 10.2c.5 3 1.9 4.4 4.9 4.9-3 .5-4.4 1.9-4.9 4.9-.5-3-1.9-4.4-4.9-4.9 3-.5 4.4-1.9 4.9-4.9Z"
            fill="#059669"
          />
          <circle cx="21.6" cy="12.4" r="1.5" fill="#10b981" />
        </svg>
      </span>
      {withWordmark && (
        <span className="leading-tight">
          <span className="block text-sm font-bold tracking-tight">eluue ai agent</span>
          <span className="block text-[11px] text-muted-foreground">WhatsApp AI employees</span>
        </span>
      )}
    </Link>
  );
}

export function LogoIcon({ size = 32 }: { size?: number }) {
  return <Logo size={size} withWordmark={false} />;
}

export function FooterBrand() {
  return (
    <p className="flex items-center gap-2">
      <span
        className="flex h-6 w-6 items-center justify-center rounded-[28%] text-white"
        style={{ background: "linear-gradient(135deg,#34d399,#047857)" }}
      >
        <Bot className="h-3.5 w-3.5" />
      </span>
      WhatsApp AI Employee — automation, inbox, leads &amp; handoff
    </p>
  );
}
