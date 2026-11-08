// MVMP — Reseller Portal: ledger list
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
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const entryType = searchParams.get("entryType")?.trim().toUpperCase();

    const where: any = { resellerId: reseller.id };
    if (entryType) where.entryType = entryType;

    const [total, items] = await Promise.all([
      db.resellerLedger.count({ where }),
      db.resellerLedger.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Manually attach invoice numbers since ResellerLedger has no relation to Transaction
    const txIds = items.map((i) => i.transactionId).filter(Boolean) as string[];
    const txs = txIds.length
      ? await db.transaction.findMany({
          where: { id: { in: txIds } },
          select: { id: true, invoiceNumber: true, status: true, amount: true },
        })
      : [];
    const txMap = new Map(txs.map((t) => [t.id, t]));

    const shapedItems = items.map((i) => ({
      ...i,
      transaction: i.transactionId ? txMap.get(i.transactionId) || null : null,
    }));

    return NextResponse.json({
      success: true,
      data: serialize({
        items: shapedItems,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        currentBalance: reseller.balance,
      }),
    });
  } catch (e: any) {
    console.error("Reseller ledger error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
