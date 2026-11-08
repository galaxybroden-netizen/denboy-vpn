// MVMP — Customer Portal: list packages (with eligibility)
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

    // Premium eligibility: customer has at least one prior PAID transaction
    const paidTxCount = await db.transaction.count({
      where: { customerId: customer.id, status: "PAID" },
    });
    const hasPriorPaid = paidTxCount > 0;

    const packages = await db.package.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ isFeatured: "desc" }, { price: "asc" }],
      include: {
        protocols: {
          include: {
            protocol: {
              select: { id: true, key: true, displayName: true, engine: true, isPremium: true },
            },
          },
        },
        _count: { select: { subscriptions: true } },
      },
    });

    // Mark eligibility
    const items = packages.map((p) => {
      const protocols = p.protocols.map((pp) => pp.protocol);
      const packageIsPremium = protocols.some((pr) => pr.isPremium);
      const eligible = !packageIsPremium || hasPriorPaid;
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        currency: p.currency,
        durationDays: p.durationDays,
        quotaBytes: p.quotaBytes,
        maxDevices: p.maxDevices,
        isFeatured: p.isFeatured,
        isPremium: packageIsPremium,
        eligible,
        subscribersCount: p._count.subscriptions,
        protocols: protocols.map((pr) => ({
          id: pr.id,
          key: pr.key,
          displayName: pr.displayName,
          engine: pr.engine,
          isPremium: pr.isPremium,
        })),
      };
    });

    return NextResponse.json({
      success: true,
      data: serialize({
        items,
        hasPriorPaid,
      }),
    });
  } catch (e: any) {
    console.error("Customer packages error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
