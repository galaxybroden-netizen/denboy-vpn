// MVMP — Worker entry point (Phase 13 deployment stub)
//
// This is a deployment stub — it connects to Redis via BullMQ and idles.
// Phase 12.2 will populate it with:
//   - Transactional outbox processor
//   - AI conversation worker
//   - Broadcast sender
//
// The stub exists so that `mvmp-worker.service` has a real process to run,
// reports healthy status to systemd, and does NOT silently fail.
//
// Run:
//   node dist/worker/index.js
// or:
//   bun src/worker/index.ts

import { Worker, QueueEvents } from "bullmq";
import Redis from "ioredis";
import { validateEncryptionOnStartup } from "@/lib/crypto";
import { validateEnvironment, reportValidation } from "@/lib/env-validate";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

function log(level: "info" | "warn" | "error", msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta });
  console[level === "error" ? "error" : "log"](line);
}

async function main() {
  log("info", "MVMP worker starting", { redis: REDIS_URL.replace(/:[^:@]+@/, ":***@") });

  // Phase 14 TASK 2: shared env validation (fails fast in production)
  const envResult = validateEnvironment();
  const exitCode = reportValidation(envResult);
  if (exitCode !== 0) {
    process.exit(exitCode);
  }

  // Encryption-key validation (throws in production if AI_ENCRYPTION_KEY missing)
  validateEncryptionOnStartup();

  const connection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    reconnectOnError(err) {
      const targets = [/<REDIS ECONNREFUSED>/i, /READONLY/];
      return targets.some((t) => t.test(err.message));
    },
  });
  connection.on("error", (err) => log("error", "redis error", { message: err.message }));
  connection.on("connect", () => log("info", "redis connected"));
  connection.on("reconnecting", (delay) => log("warn", "redis reconnecting", { delay }));

  // Stub worker: registers on a queue that is currently never produced to.
  // Phase 12.2 will swap this for the transactional-outbox processor.
  const worker = new Worker(
    "mvmp-default",
    async (job) => {
      log("info", "job received (stub — no-op)", { id: job.id, name: job.name });
      return { ok: true };
    },
    { connection, concurrency: 4 }
  );
  worker.on("completed", (job) => log("info", "job completed", { id: job.id }));
  worker.on("failed", (job, err) => log("error", "job failed", { id: job?.id, message: err.message }));

  // Queue events so we can see stalled jobs etc.
  const queueEvents = new QueueEvents("mvmp-default", { connection });
  queueEvents.on("stalled", ({ jobId }) => log("warn", "job stalled", { id: jobId }));

  log("info", "MVMP worker ready", { queue: "mvmp-default" });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log("info", "received signal, shutting down", { signal });
    await worker.close();
    await queueEvents.close();
    await connection.quit();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // Heartbeat — so systemd watchdog sees liveness even with no jobs
  setInterval(() => {
    log("info", "heartbeat", { redisStatus: connection.status });
  }, 60_000);
}

main().catch((err) => {
  log("error", "fatal startup error", { message: err.message, stack: err.stack });
  process.exit(1);
});
