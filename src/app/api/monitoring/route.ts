// MVMP — Monitoring dashboard
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role, "monitoring.view")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat monitoring" } },
        { status: 403 }
      );
    }

    // All servers with agent + latest metric
    const servers = await db.server.findMany({
      where: { status: { not: "DECOMMISSIONED" } },
      include: { agent: true },
      orderBy: { name: "asc" },
    });

    const serverIds = servers.map((s) => s.id);
    const latestMetricsRaw = await db.serverMetric.findMany({
      where: { serverId: { in: serverIds } },
      orderBy: { recordedAt: "desc" },
      take: serverIds.length * 3,
    });
    const metricByServer = new Map<string, (typeof latestMetricsRaw)[number]>();
    for (const m of latestMetricsRaw) {
      if (!metricByServer.has(m.serverId)) metricByServer.set(m.serverId, m);
    }

    const serversWithMetrics = servers.map((s) => ({
      ...s,
      latestMetric: metricByServer.get(s.id) || null,
    }));

    // Aggregates
    const totalActiveAccounts = await db.vpnAccount.count({ where: { status: "ACTIVE" } });
    const metricValues = Array.from(metricByServer.values());
    const totalBandwidth = metricValues.reduce((a, b) => a + b.bandwidthMbps, 0);
    const avgCpu = metricValues.length
      ? metricValues.reduce((a, b) => a + b.cpuPercent, 0) / metricValues.length
      : 0;
    const avgRam = metricValues.length
      ? metricValues.reduce((a, b) => a + Number(b.ramUsedBytes), 0) / metricValues.length
      : 0;

    // Recent jobs (20)
    const recentJobs = await db.job.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { server: { select: { id: true, name: true, publicIp: true } } },
    });

    // Recent audit logs (10)
    const recentAuditLogs = await db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { id: true, name: true, role: true } } },
    });

    // Alerts: cpu > 80% OR agent.status != ONLINE OR maintenance_mode
    const alerts = serversWithMetrics
      .filter((s) => {
        const cpuHigh = s.latestMetric && s.latestMetric.cpuPercent > 80;
        const agentDown = !s.agent || s.agent.status !== "ONLINE";
        return cpuHigh || agentDown || s.maintenanceMode;
      })
      .map((s) => ({
        serverId: s.id,
        serverName: s.name,
        publicIp: s.publicIp,
        region: s.region,
        cpuPercent: s.latestMetric?.cpuPercent ?? null,
        agentStatus: s.agent?.status ?? "OFFLINE",
        maintenanceMode: s.maintenanceMode,
        serverStatus: s.status,
        lastHeartbeatAt: s.agent?.lastHeartbeatAt ?? null,
        alertTypes: [
          ...(s.latestMetric && s.latestMetric.cpuPercent > 80 ? ["HIGH_CPU"] : []),
          ...(!s.agent || s.agent.status !== "ONLINE" ? ["AGENT_NOT_ONLINE"] : []),
          ...(s.maintenanceMode ? ["MAINTENANCE_MODE"] : []),
        ],
      }));

    return NextResponse.json({
      success: true,
      data: serialize({
        servers: serversWithMetrics,
        aggregate: {
          totalActiveAccounts,
          totalBandwidthMbps: Number(totalBandwidth.toFixed(2)),
          avgCpu: Number(avgCpu.toFixed(2)),
          avgRamBytes: Math.round(avgRam),
        },
        recentJobs,
        recentAuditLogs,
        alerts,
      }),
    });
  } catch (e: any) {
    console.error("Monitoring error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
