// MVMP — Customer Portal: dashboard
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
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
    if (user.role !== "CUSTOMER") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Akses hanya untuk customer" } },
        { status: 403 }
      );
    }

    const customer = await db.customer.findUnique({ where: { userId: user.id } });
    if (!customer) {
      return NextResponse.json(
        { success: false, error: { code: "PROFILE_NOT_FOUND", message: "Profil customer tidak ditemukan" } },
        { status: 403 }
      );
    }

    // Stats: active accounts, active subscriptions, total quota used, total quota remaining
    const [activeAccounts, activeSubscriptions, accountsForQuota, upcomingExpirationsRaw, recentTransactionsRaw, featuredPackagesRaw] = await Promise.all([
      db.vpnAccount.count({ where: { customerId: customer.id, status: "ACTIVE" } }),
      db.subscription.count({ where: { customerId: customer.id, status: "ACTIVE" } }),
      db.vpnAccount.findMany({
        where: { customerId: customer.id },
        select: { uploadBytes: true, downloadBytes: true, quotaBytes: true, status: true },
      }),
      db.vpnAccount.findMany({
        where: {
          customerId: customer.id,
          status: "ACTIVE",
          expiresAt: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          },
        },
        orderBy: { expiresAt: "asc" },
        take: 10,
        include: {
          server: { select: { id: true, name: true, publicIp: true, region: true, countryCode: true } },
          protocol: { select: { id: true, displayName: true, engine: true, key: true } },
        },
      }),
      db.transaction.findMany({
        where: { customerId: customer.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          invoice: { select: { invoiceNumber: true } },
          payments: { select: { provider: true, status: true, amount: true } },
        },
      }),
      db.package.findMany({
        where: { status: "ACTIVE", isFeatured: true },
        orderBy: { price: "asc" },
        take: 4,
        include: {
          protocols: { include: { protocol: { select: { id: true, displayName: true, engine: true, key: true } } } },
        },
      }),
    ]);

    // Aggregate quota
    let totalQuotaUsed = 0n;
    let totalQuotaLimit = 0n;
    for (const a of accountsForQuota) {
      totalQuotaUsed += a.uploadBytes + a.downloadBytes;
      if (a.quotaBytes) totalQuotaLimit += a.quotaBytes;
    }
    const totalQuotaRemaining =
      totalQuotaLimit > totalQuotaUsed ? totalQuotaLimit - totalQuotaUsed : 0n;

    // Top 5 active accounts with usage percent
    const topAccountsRaw = await db.vpnAccount.findMany({
      where: { customerId: customer.id, status: "ACTIVE" },
      orderBy: { expiresAt: "asc" },
      take: 5,
      include: {
        server: { select: { id: true, name: true, publicIp: true, region: true, countryCode: true } },
        protocol: { select: { id: true, displayName: true, engine: true, key: true } },
      },
    });

    const topAccounts = topAccountsRaw.map((a) => {
      const used = Number(a.uploadBytes + a.downloadBytes);
      const limit = a.quotaBytes ? Number(a.quotaBytes) : 0;
      const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
      return {
        id: a.id,
        username: a.username,
        status: a.status,
        expiresAt: a.expiresAt,
        server: a.server,
        protocol: a.protocol,
        quotaUsed: used,
        quotaLimit: limit,
        quotaUsagePercent: percent,
      };
    });

    // Recent transactions shaped
    const recentTransactions = recentTransactionsRaw.map((t) => ({
      id: t.id,
      invoiceNumber: t.invoiceNumber,
      amount: t.amount,
      currency: t.currency,
      status: t.status,
      createdAt: t.createdAt,
      paidAt: t.paidAt,
      provider: t.payments?.[0]?.provider || null,
    }));

    // Upcoming expirations simplified
    const upcomingExpirations = upcomingExpirationsRaw.map((a) => ({
      id: a.id,
      username: a.username,
      expiresAt: a.expiresAt,
      server: a.server,
      protocol: a.protocol,
    }));

    // Flatten recommended packages: raw Prisma shape is
    //   protocols: [{ packageId, protocolId, protocol: { id, key, displayName, engine } }]
    // Component expects flat shape:
    //   protocols: [{ id, key, displayName, engine }]
    const featuredPackages = featuredPackagesRaw.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      price: pkg.price,
      currency: pkg.currency,
      durationDays: pkg.durationDays,
      quotaBytes: pkg.quotaBytes,
      maxDevices: pkg.maxDevices,
      isFeatured: pkg.isFeatured,
      status: pkg.status,
      protocols: pkg.protocols.map((pp) => ({
        id: pp.protocol.id,
        key: pp.protocol.key,
        displayName: pp.protocol.displayName,
        engine: pp.protocol.engine,
      })),
    }));

    return NextResponse.json({
      success: true,
      data: serialize({
        profile: {
          id: customer.id,
          customerCode: customer.customerCode,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          status: customer.status,
        },
        stats: {
          activeAccounts,
          activeSubscriptions,
          totalQuotaUsed: String(totalQuotaUsed),
          totalQuotaRemaining: String(totalQuotaRemaining),
          totalQuotaLimit: String(totalQuotaLimit),
        },
        activeAccounts: topAccounts,
        upcomingExpirations,
        recentTransactions,
        recommendedPackages: featuredPackages,
      }),
    });
  } catch (e: any) {
    console.error("Customer dashboard error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
