// MVMP — Reseller Portal: commissions list
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const statusParam = searchParams.get("status")?.trim().toUpperCase();

    const where: any = { resellerId: reseller.id };
    if (statusParam) where.status = statusParam;

    const [total, items, totalsAgg] = await Promise.all([
      db.resellerCommission.count({ where }),
      db.resellerCommission.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          transaction: {
            select: {
              invoiceNumber: true,
              status: true,
              amount: true,
              customer: { select: { id: true, name: true, customerCode: true } },
            },
          },
        },
      }),
      db.resellerCommission.aggregate({
        where: { resellerId: reseller.id },
        _sum: { amount: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: serialize({
        items,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        totalEarned: totalsAgg._sum.amount ?? 0,
      }),
    });
  } catch (e: any) {
    console.error("Reseller commissions error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
