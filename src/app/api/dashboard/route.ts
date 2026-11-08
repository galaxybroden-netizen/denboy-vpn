// MVMP — Dashboard aggregated stats endpoint
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
    if (!hasPermission(user.role, "dashboard.view")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengakses dashboard" } },
        { status: 403 }
      );
    }

    // Aggregate counts
    const [
      serversByStatus,
      vpnAccountsByStatus,
      customersCount,
      resellersCount,
      transactionsCount,
      revenueAgg,
      protocolsCount,
      recentAuditLogs,
      recentTransactions,
      latestMetricsRaw,
      notificationCount,
    ] = await Promise.all([
      db.server.groupBy({ by: ["status"], _count: true }),
      db.vpnAccount.groupBy({ by: ["status"], _count: true }),
      db.customer.count(),
      db.reseller.count(),
      db.transaction.count(),
      db.transaction.aggregate({
        where: { status: "PAID" },
        _sum: { amount: true },
      }),
      db.protocol.count(),
      db.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { user: { select: { name: true, role: true } } },
      }),
      db.transaction.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          customer: { select: { name: true, email: true, customerCode: true } },
          payments: { select: { id: true, provider: true, status: true, amount: true } },
        },
      }),
      // Latest metrics (will dedupe per server below)
      db.serverMetric.findMany({
        orderBy: { recordedAt: "desc" },
        take: 60,
        include: { server: { select: { id: true, name: true, publicIp: true, region: true } } },
      }),
      db.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);

    // Build server status map
    const serverStatusMap: Record<string, number> = {};
    for (const s of serversByStatus) serverStatusMap[s.status] = s._count;

    // Build vpn account status map
    const vpnStatusMap: Record<string, number> = {};
    for (const v of vpnAccountsByStatus) vpnStatusMap[v.status] = v._count;

    // Dedupe latest metric per server (limit 5)
    const seenServerIds = new Set<string>();
    const latestMetrics: typeof latestMetricsRaw = [];
    for (const m of latestMetricsRaw) {
      if (!seenServerIds.has(m.serverId)) {
        seenServerIds.add(m.serverId);
        latestMetrics.push(m);
        if (latestMetrics.length >= 5) break;
      }
    }

    // 6-month revenue trend (group by month)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const paidTxs = await db.transaction.findMany({
      where: { status: "PAID", createdAt: { gte: sixMonthsAgo } },
      select: { amount: true, createdAt: true, currency: true },
    });

    const monthMap = new Map<string, { month: string; revenue: number; count: number }>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, { month: key, revenue: 0, count: 0 });
    }
    for (const t of paidTxs) {
      const d = t.createdAt;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const entry = monthMap.get(key);
      if (entry) {
        entry.revenue += t.amount;
        entry.count += 1;
      }
    }
    const revenueTrend = Array.from(monthMap.values());

    // Aggregates from latest metrics
    const aggCpu = latestMetrics.length
      ? latestMetrics.reduce((a, b) => a + b.cpuPercent, 0) / latestMetrics.length
      : 0;
    const aggBandwidth = latestMetrics.reduce((a, b) => a + b.bandwidthMbps, 0);
    const totalActiveAccounts = latestMetrics.reduce((a, b) => a + b.activeAccounts, 0);

    return NextResponse.json({
      success: true,
      data: serialize({
        stats: {
          servers: {
            total: Object.values(serverStatusMap).reduce((a, b) => a + b, 0),
            byStatus: serverStatusMap,
          },
          vpnAccounts: {
            total: Object.values(vpnStatusMap).reduce((a, b) => a + b, 0),
            byStatus: vpnStatusMap,
          },
          customers: customersCount,
          resellers: resellersCount,
          transactions: transactionsCount,
          protocols: protocolsCount,
          totalRevenue: revenueAgg._sum.amount ?? 0,
        },
        recentAuditLogs,
        recentTransactions,
        serverMetrics: latestMetrics,
        revenueTrend,
        notificationsUnread: notificationCount,
        aggregate: {
          avgCpu: Number(aggCpu.toFixed(2)),
          totalBandwidthMbps: Number(aggBandwidth.toFixed(2)),
          totalActiveAccounts,
        },
      }),
    });
  } catch (e: any) {
    console.error("Dashboard error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
