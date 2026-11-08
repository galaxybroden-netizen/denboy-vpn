// MVMP — Transactions list
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { resolveTenantScope, customerOwnedScopeWhere } from "@/lib/tenant-scope";

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role, "transactions.view")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat transaksi" } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim();
    const customerId = searchParams.get("customerId")?.trim();
    const resellerId = searchParams.get("resellerId")?.trim();
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: any = {};
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (resellerId) where.resellerId = resellerId;
    if (search) where.invoiceNumber = { contains: search };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Tenant boundary: resellers only see transactions of their own customers.
    const scope = await resolveTenantScope(user);
    if (scope.kind === "none") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Profil tenant tidak ditemukan" } },
        { status: 403 }
      );
    }
    const scopeWhere = customerOwnedScopeWhere(scope);
    if (Object.keys(scopeWhere).length > 0) {
      where.AND = [...(where.AND || []), scopeWhere];
    }

    const [total, items] = await Promise.all([
      db.transaction.count({ where }),
      db.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          customer: { select: { id: true, name: true, email: true, customerCode: true } },
          reseller: {
            select: { id: true, resellerCode: true, user: { select: { name: true } } },
          },
          payments: {
            select: {
              id: true,
              status: true,
              provider: true,
              paymentMethod: true,
              amount: true,
              paidAt: true,
              createdAt: true,
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
    console.error("Transactions list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
