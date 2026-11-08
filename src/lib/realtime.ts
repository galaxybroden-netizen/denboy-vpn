// MVMP — Realtime broadcast helper
// Next.js API routes call broadcast() to push events to connected browser
// clients via the socket.io mini-service (mini-services/realtime-service).
// Best-effort: never throws, never blocks the main request flow.

const EMIT_URL = process.env.REALTIME_EMIT_URL || "http://127.0.0.1:3004/emit";

export async function broadcast(event: string, payload?: unknown): Promise<void> {
  try {
    await fetch(EMIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, payload }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // Realtime is best-effort — service may be restarting.
  }
}

// Canonical event names
export const REALTIME_EVENTS = {
  NOTIFICATION_NEW: "notification:new",
  METRICS_UPDATE: "metrics:update",
  JOB_UPDATE: "job:update",
  PAYMENT_UPDATE: "payment:update",
  ACCOUNT_UPDATE: "account:update",
  EMAIL_NEW: "email:new",
} as const;
