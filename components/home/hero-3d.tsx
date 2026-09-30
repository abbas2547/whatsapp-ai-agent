"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Bot, CalendarCheck2, Inbox, PlayCircle, Sparkles, Star, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const LOOP: Array<{ from: "customer" | "ai"; text: string; sub: string }> = [
  { from: "customer", text: "Hi! Do you deliver to Koramangala? Need 20 office chairs by Friday.", sub: "Customer · WhatsApp · now" },
  { from: "ai", text: "Yes — we deliver across Bengaluru in 48 hrs. Bulk rate on 20 chairs. Shall I book a quick call to confirm specs?", sub: "Sales agent · AI · now ✓✓" },
  { from: "customer", text: "Tomorrow 11am works.", sub: "Customer · WhatsApp · now" },
  { from: "ai", text: "Locked in — Tue 11:00am, calendar invite sent. Anything else for the office setup?", sub: "Sales agent · AI · now ✓✓" },
];

function useTilt(max = 10) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const onMove = useCallback(
    (e: React.MouseEvent) => {
      const el = ref.current;
      if (!el || reduce) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `rotateY(${px * max}deg) rotateX(${-py * max}deg) translateZ(0)`;
    },
    [max, reduce],
  );
  const onLeave = useCallback(() => {
    if (ref.current) ref.current.style.transform = "rotateY(0deg) rotateX(0deg)";
  }, []);
  return { ref, onMove, onLeave };
}

export function Hero3D() {
  const { ref, onMove, onLeave } = useTilt(9);
  const [visible, setVisible] = useState(0);
  const reduce = useReducedMotion();
  // Reduced-motion users see the full conversation immediately (no animation).
  const shown = reduce ? LOOP.length + 1 : visible;

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => {
      setVisible((v) => (v >= LOOP.length + 1 ? 0 : v + 1));
    }, 1600);
    return () => clearInterval(t);
  }, [reduce]);

  return (
    <div className="relative">
      {/* ambient orbs */}
      <div aria-hidden className="pointer-events-none absolute -inset-8 overflow-visible">
        <div className="absolute -left-10 top-6 h-44 w-44 rounded-full bg-emerald-400/25 blur-3xl animate-blob" />
        <div className="absolute -right-8 bottom-0 h-52 w-52 rounded-full bg-teal-300/25 blur-3xl animate-blob-delayed" />
        <div className="absolute left-1/3 top-0 h-24 w-64 rounded-full bg-lime-200/30 blur-2xl animate-float" />
      </div>

      <div className="perspective-1200 relative" onMouseMove={onMove} onMouseLeave={onLeave}>
        <div ref={ref} className="preserve-3d transition-transform duration-200 ease-out will-change-transform">
          {/* floating badges */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="absolute -left-3 top-10 z-20 sm:-left-8"
            style={{ transform: "translateZ(70px)" }}
          >
            <div className="glass flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold shadow-lg animate-float">
              <span className="flex h-6 w-6 items-center justify-center rounded-xl bg-emerald-500 text-white">
                <TrendingUp className="h-3.5 w-3.5" />
              </span>
              Lead score 82
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65 }}
            className="absolute -right-3 top-1/3 z-20 sm:-right-6"
            style={{ transform: "translateZ(90px)" }}
          >
            <div className="glass flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold shadow-lg animate-float-delayed">
              <span className="flex h-6 w-6 items-center justify-center rounded-xl bg-teal-600 text-white">
                <CalendarCheck2 className="h-3.5 w-3.5" />
              </span>
              Booked · Tue 11am
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8 }}
            className="absolute -bottom-5 left-8 z-20"
            style={{ transform: "translateZ(60px)" }}
          >
            <div className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-emerald-700 shadow-lg">
              <Star className="h-3 w-3 fill-emerald-500 text-emerald-500" /> Replies in seconds · 24/7
            </div>
          </motion.div>

          {/* phone */}
          <Card className="card-elevated relative z-10 overflow-hidden rounded-[1.75rem] border-2 animate-pop-in">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Inbox className="h-4 w-4 text-muted-foreground" /> Shared inbox
              </p>
              <Badge variant="success" className="animate-pulse-soft">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" /> AI active
              </Badge>
            </div>
            <CardContent className="wa-chat-bg flex min-h-[320px] flex-col gap-3 p-4">
              {LOOP.slice(0, Math.min(shown, LOOP.length)).map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 28 }}
                  className={cn("flex", m.from === "customer" ? "justify-start" : "justify-end")}
                >
                  <div
                    className={cn(
                      "max-w-[86%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
                      m.from === "customer"
                        ? "rounded-tl-md bg-white dark:bg-card"
                        : "rounded-tr-md bg-[#d9fdd3] text-gray-900 dark:bg-emerald-600 dark:text-white",
                    )}
                  >
                    {m.text}
                    <span className="mt-1 block text-[11px] opacity-70">{m.sub}</span>
                  </div>
                </motion.div>
              ))}
              {shown <= LOOP.length ? (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md bg-white px-4 py-3 shadow-sm dark:bg-card">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: `${d * 0.18}s` }} />
                    ))}
                  </div>
                </div>
              ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-800 shadow-sm dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                  <CalendarCheck2 className="h-3.5 w-3.5" />
                  Appointment proposed · Lead qualified (score 82) · Teammate notified
                </motion.div>
              )}
            </CardContent>
            {/* shine sweep */}
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.75rem]">
              <div className="absolute -left-1/2 top-0 h-full w-1/3 rotate-12 bg-white/20 blur-xl animate-shine" />
            </div>
          </Card>

          {/* orbiting spark */}
          <div aria-hidden className="pointer-events-none absolute -right-4 -top-4 z-20 animate-orbit">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-700 text-white shadow-xl">
              <Bot className="h-5 w-5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroCopy() {
  return (
    <div className="flex flex-col items-start gap-5">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Badge variant="success" className="shadow-sm">
          <Sparkles className="mr-1 h-3 w-3" /> WhatsApp Cloud API · AI employees
        </Badge>
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.08 }}
        className="max-w-xl text-balance text-4xl font-bold leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.5rem]"
      >
        AI employees that sell on{" "}
        <span className="text-gradient">WhatsApp</span> while you sleep
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.16 }}
        className="max-w-xl text-lg leading-8 text-muted-foreground"
      >
        Instant replies, lead qualification, bookings and follow-ups — trained on
        your business, with humans one tap away.
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.24 }}
        className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row"
      >
        <Button asChild size="lg" className="btn-magnetic shadow-lg shadow-emerald-600/20">
          <Link href="/register">
            Start Building <ArrowRight />
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="btn-magnetic">
          <a href="#how-it-works">
            <PlayCircle /> See How It Works
          </a>
        </Button>
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground"
      >
        <span className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" /><span className="h-2 w-2 rounded-full bg-emerald-600" /></span>
          Online now — median reply 4s
        </span>
        <span>·</span><span>No credit card to try</span><span>·</span><span>Human takeover anytime</span>
      </motion.div>
    </div>
  );
}
