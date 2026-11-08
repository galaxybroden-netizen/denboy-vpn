// MVMP — Payments list
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission } from "@/lib/auth";
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
    if (!hasPermission(user.role, "payments.verify")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat pembayaran" } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const status = searchParams.get("status")?.trim();
    const provider = searchParams.get("provider")?.trim();

    const where: any = {};
    // "all" is a UI-only sentinel — do not pass it to Prisma enum filter
    if (status && status.toUpperCase() !== "ALL") where.status = status;
    if (provider && provider.toUpperCase() !== "ALL") where.provider = provider;

    const [total, items] = await Promise.all([
      db.payment.count({ where }),
      db.payment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          transaction: {
            select: {
              id: true,
              invoiceNumber: true,
              amount: true,
              currency: true,
              status: true,
              customer: { select: { id: true, name: true, customerCode: true } },
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: serialize({
        items,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      }),
    });
  } catch (e: any) {
    console.error("Payments list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
