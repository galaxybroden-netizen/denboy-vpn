// MVMP — Customer Portal: list own transactions
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

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const statusParam = searchParams.get("status")?.trim().toUpperCase() || "ALL";

    const where: any = { customerId: customer.id };
    if (statusParam && statusParam !== "ALL") {
      where.status = statusParam;
    }

    const [total, items] = await Promise.all([
      db.transaction.count({ where }),
      db.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          payments: {
            select: {
              provider: true,
              paymentMethod: true,
              status: true,
              qrisData: true,
              vaNumber: true,
              expiresAt: true,
              createdAt: true,
            },
          },
          invoice: { select: { invoiceNumber: true, dueAt: true } },
        },
      }),
    ]);

    const shapedItems = items.map((t) => ({
      id: t.id,
      invoiceNumber: t.invoiceNumber,
      type: t.type,
      amount: t.amount,
      currency: t.currency,
      status: t.status,
      createdAt: t.createdAt,
      paidAt: t.paidAt,
      payment: t.payments?.[0] || null,
      invoice: t.invoice,
    }));

    return NextResponse.json({
      success: true,
      data: serialize({
        items: shapedItems,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      }),
    });
  } catch (e: any) {
    console.error("Customer my-transactions error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
