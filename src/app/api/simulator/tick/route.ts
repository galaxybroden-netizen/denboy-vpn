// MVMP — Mock agent simulator tick
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { broadcast, REALTIME_EVENTS } from "@/lib/realtime";
import { sendExpiryWarningEmail } from "@/lib/mailer";
import { notifyAdmins } from "@/lib/notify";

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randBytes(minMB: number, maxMB: number) {
  return BigInt(randInt(minMB, maxMB) * 1024 * 1024);
}
function chance(p: number) {
  return Math.random() < p;
}

export async function POST() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role, "servers.manage")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin menjalankan simulator" } },
        { status: 403 }
      );
    }

    const servers = await db.server.findMany({
      where: { status: "ONLINE" },
      include: { agent: true },
    });

    // Process servers with ONLINE or DEGRADED agents (DEGRADED can self-heal)
    const onlineServers = servers.filter(
      (s) => s.agent && (s.agent.status === "ONLINE" || s.agent.status === "DEGRADED")
    );
    if (onlineServers.length === 0) {
      return NextResponse.json({
        success: true,
        data: serialize({
          serversUpdated: 0,
          metricsCreated: 0,
          jobsProcessed: 0,
        }),
      });
    }

    let serversUpdated = 0;
    let metricsCreated = 0;
    let jobsProcessed = 0;
    let expiryWarnings = 0;

    // 5% chance: degrade one random agent; DEGRADED agents recover with 70% chance
    let degradedServerId: string | null = null;
    const degradedIds = onlineServers
      .filter((s) => s.agent?.status === "DEGRADED")
      .filter((s) => !chance(0.7))
      .map((s) => s.id);
    if (chance(0.05) && onlineServers.length > 0) {
      const target = onlineServers[randInt(0, onlineServers.length - 1)];
      degradedServerId = target.id;
    }
    const stayDegraded = new Set(degradedIds);

    const now = new Date();

    // For each online server, update agent heartbeat + create metric
    for (const s of onlineServers) {
      const agentStatus =
        s.id === degradedServerId || stayDegraded.has(s.id) ? "DEGRADED" : "ONLINE";
      await db.serverAgent.update({
        where: { serverId: s.id },
        data: { lastHeartbeatAt: now, status: agentStatus },
      });
      serversUpdated++;

      // Realistic random values
      const cpu = randInt(10, 70);
      const ramUsedFraction = randInt(30, 60) / 100;
      const ramUsedBytes = BigInt(
        Math.floor(Number(s.ramTotalBytes) * ramUsedFraction)
      );
      const diskUsedBytes = BigInt(
        Math.floor(Number(s.diskTotalBytes) * (randInt(35, 70) / 100))
      );
      const networkRx = randBytes(10, 500);
      const networkTx = randBytes(5, 200);

      // Active accounts: count actual ACTIVE vpn accounts for realism (cached fallback to small random)
      const activeAccountsCount = await db.vpnAccount.count({
        where: { serverId: s.id, status: "ACTIVE" },
      });
      const activeAccounts = activeAccountsCount || randInt(1, 20);

      const bandwidth = randInt(50, 800);

      await db.serverMetric.create({
        data: {
          serverId: s.id,
          cpuPercent: cpu,
          ramUsedBytes,
          diskUsedBytes,
          networkRxBytes: networkRx,
          networkTxBytes: networkTx,
          loadAverage: `${(cpu / 100 * 4).toFixed(2)}, ${(cpu / 100 * 3).toFixed(2)}, ${(cpu / 100 * 2).toFixed(2)}`,
          activeAccounts,
          bandwidthMbps: bandwidth,
        },
      });
      metricsCreated++;

      // 10% chance: audit log AGENT_HEARTBEAT
      if (chance(0.10)) {
        await auditLog({
          actorUserId: null,
          actorType: "SYSTEM",
          action: "AGENT_HEARTBEAT",
          resourceType: "Server",
          resourceId: s.id,
          metadata: { server: s.name, cpu, bandwidth },
        });
      }
    }

    // Process QUEUED jobs: 30% chance advance each QUEUED job -> PROCESSING -> SUCCESS
    const queuedJobs = await db.job.findMany({
      where: { status: "QUEUED" },
      take: 50,
    });
    for (const job of queuedJobs) {
      if (chance(0.30)) {
        // Advance to PROCESSING first
        await db.job.update({
          where: { id: job.id },
          data: {
            status: "PROCESSING",
            startedAt: now,
          },
        });
        // Then immediately to SUCCESS (simulated completion)
        await db.job.update({
          where: { id: job.id },
          data: {
            status: "SUCCESS",
            completedAt: new Date(),
            result: "Simulated success",
          },
        });
        await db.jobLog.create({
          data: {
            jobId: job.id,
            level: "INFO",
            message: `Job ${job.jobType} processed by simulator`,
          },
        });
        jobsProcessed++;
      }
    }

    if (jobsProcessed > 0) {
      await broadcast(REALTIME_EVENTS.JOB_UPDATE, { processed: jobsProcessed });
    }

    // Update one random vpnAccount's upload/download bytes (per server, pick one)
    for (const s of onlineServers) {
      const acct = await db.vpnAccount.findFirst({
        where: { serverId: s.id, status: "ACTIVE" },
      });
      if (acct && chance(0.5)) {
        const upAdd = randBytes(1, 100);
        const downAdd = randBytes(1, 100);
        await db.vpnAccount.update({
          where: { id: acct.id },
          data: {
            uploadBytes: acct.uploadBytes + upAdd,
            downloadBytes: acct.downloadBytes + downAdd,
          },
        });
        await db.vpnUsage.create({
          data: {
            vpnAccountId: acct.id,
            serverId: s.id,
            uploadBytes: upAdd,
            downloadBytes: downAdd,
            totalBytes: upAdd + downAdd,
            source: "simulator",
            counterEpoch: now.toISOString(),
          },
        });
      }
    }

    // --- Batch 3: subscription expiry email warnings (mock SMTP) ---
    // ACTIVE subscriptions expiring within 3 days -> warn customer once per subscription.
    const warnWindowEnd = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    const expiring = await db.subscription.findMany({
      where: { status: "ACTIVE", expiresAt: { lte: warnWindowEnd } },
      include: { customer: true, vpnAccounts: { take: 1 } },
      take: 20,
    });
    for (const sub of expiring) {
      const alreadyWarned = await db.emailLog.count({
        where: { template: "EXPIRY_WARNING", relatedId: sub.id },
      });
      if (alreadyWarned > 0) continue;
      const account = sub.vpnAccounts[0];
      await sendExpiryWarningEmail({
        to: sub.customer.email,
        customerName: sub.customer.name,
        username: account?.username || "-",
        expiresAt: sub.expiresAt,
        relatedSubscriptionId: sub.id,
      });
      expiryWarnings++;
    }
    if (expiryWarnings > 0) {
      await notifyAdmins({
        type: "WARNING",
        title: `${expiryWarnings} langganan segera berakhir`,
        body: `Email peringatan kedaluwarsa telah dikirim ke ${expiryWarnings} pelanggan (berakhir ≤ 3 hari).`,
      });
    }

    // --- Batch 3: occasional system alert for realtime demo ---
    if (chance(0.12) && onlineServers.length > 0) {
      const s = onlineServers[randInt(0, onlineServers.length - 1)];
      await notifyAdmins({
        type: "INFO",
        title: `Lalu lintas tinggi di ${s.name}`,
        body: `Bandwidth puncak ${randInt(600, 950)} Mbps — semua sistem berjalan normal.`,
        data: { serverId: s.id },
      });
    }

    // --- Batch 3: push fresh metrics to connected clients ---
    await broadcast(REALTIME_EVENTS.METRICS_UPDATE, {
      serversUpdated,
      metricsCreated,
      jobsProcessed,
      expiryWarnings,
      at: now.toISOString(),
    });

    return NextResponse.json({
      success: true,
      data: serialize({
        serversUpdated,
        metricsCreated,
        jobsProcessed,
        expiryWarnings,
      }),
    });
  } catch (e: any) {
    console.error("Simulator tick error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
