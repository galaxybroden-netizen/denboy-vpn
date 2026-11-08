// MVMP — Reseller Portal: dashboard
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
    if (user.role !== "RESELLER") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Akses hanya untuk reseller" } },
        { status: 403 }
      );
    }

    const reseller = await db.reseller.findUnique({ where: { userId: user.id } });
    if (!reseller) {
      return NextResponse.json(
        { success: false, error: { code: "PROFILE_NOT_FOUND", message: "Profil reseller tidak ditemukan" } },
        { status: 403 }
      );
    }

    // Stats
    const [customersCount, activeAccountsAgg, commissionAggAll, commissionAggPending, transactionsCountPaid, recentCustomersRaw, recentLedger, recentCommissions] = await Promise.all([
      db.customer.count({ where: { resellerId: reseller.id } }),
      // Active accounts across all reseller's customers
      db.vpnAccount.aggregate({
        where: { customer: { resellerId: reseller.id }, status: "ACTIVE" },
        _count: true,
      }),
      db.resellerCommission.aggregate({
        where: { resellerId: reseller.id },
        _sum: { amount: true },
      }),
      db.resellerCommission.aggregate({
        where: { resellerId: reseller.id, status: "PENDING" },
        _sum: { amount: true },
      }),
      db.transaction.count({ where: { resellerId: reseller.id, status: "PAID" } }),
      db.customer.findMany({
        where: { resellerId: reseller.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { _count: { select: { vpnAccounts: true } } },
      }),
      db.resellerLedger.findMany({
        where: { resellerId: reseller.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      db.resellerCommission.findMany({
        where: { resellerId: reseller.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { transaction: { select: { invoiceNumber: true, customer: { select: { name: true } } } } },
      }),
    ]);

    const activeAccountsCount = activeAccountsAgg._count;
    const totalCommissionEarned = commissionAggAll._sum.amount ?? 0;
    const pendingCommission = commissionAggPending._sum.amount ?? 0;
    const accountLimitProgress =
      reseller.accountLimit > 0
        ? Math.min(100, Math.round((customersCount / reseller.accountLimit) * 100))
        : 0;

    const recentCustomers = recentCustomersRaw.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      customerCode: c.customerCode,
      status: c.status,
      activeAccounts: c._count.vpnAccounts,
    }));

    return NextResponse.json({
      success: true,
      data: serialize({
        profile: {
          id: reseller.id,
          resellerCode: reseller.resellerCode,
          name: user.name,
          email: user.email,
          phone: user.phone,
          balance: reseller.balance,
          commissionRate: reseller.commissionRate,
          accountLimit: reseller.accountLimit,
          status: reseller.status,
        },
        stats: {
          customersCount,
          activeAccountsCount,
          totalCommissionEarned,
          pendingCommission,
          transactionsCount: transactionsCountPaid,
        },
        accountLimitProgress: {
          used: customersCount,
          limit: reseller.accountLimit,
          percent: accountLimitProgress,
        },
        recentCustomers,
        recentLedger,
        recentCommissions,
      }),
    });
  } catch (e: any) {
    console.error("Reseller dashboard error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
