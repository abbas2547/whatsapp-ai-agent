import { getAdminContext } from "@/lib/admin";
import { db } from "@/lib/db";

/**
 * Admin live events via Server-Sent Events.
 * Polls lightweight counters every 10s server-side and emits JSON.
 * Client falls back to polling /api/admin/overview if SSE is blocked.
 */
export async function GET() {
  const ctx = await getAdminContext();
  if (!ctx) return Response.json({ error: "Forbidden" }, { status: 403 });

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const close = () => { closed = true; try { controller.close(); } catch { /* noop */ } };
      let lastCounts = "";
      for (let i = 0; i < 54 && !closed; i++) {
        try {
          const [users, online, payments, failures, logins] = await Promise.all([
            db.user.count(),
            db.loginEvent.count({ where: { createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } } }),
            db.payment.count({ where: { createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } }),
            db.workflowExecution.count({ where: { status: "FAILED", startedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } }),
            db.loginEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true, type: true } }),
          ]);
          const sig = `${users}|${online}|${payments}|${failures}|${logins?.createdAt?.toISOString()}`;
          if (sig !== lastCounts) {
            lastCounts = sig;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: new Date().toISOString(), users, recentLogins: online, paymentsLastHour: payments, failuresLastHour: failures, lastLogin: logins })}\n\n`));
          } else {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          }
        } catch {
          controller.enqueue(encoder.encode(`: error\n\n`));
        }
        await new Promise((r) => setTimeout(r, 10_000));
      }
      close();
    },
    cancel() {},
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
  });
}
