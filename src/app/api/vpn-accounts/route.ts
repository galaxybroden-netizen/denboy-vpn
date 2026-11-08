// MVMP — VPN accounts list
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
    if (!hasPermission(user.role, "vpn_accounts.view")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat VPN accounts" } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim();
    const serverId = searchParams.get("serverId")?.trim();
    const protocolId = searchParams.get("protocolId")?.trim();
    const customerId = searchParams.get("customerId")?.trim();

    const where: any = {};
    if (status) where.status = status;
    if (serverId) where.serverId = serverId;
    if (protocolId) where.protocolId = protocolId;
    if (customerId) where.customerId = customerId;
    if (search) {
      where.OR = [
        { username: { contains: search } },
        { customer: { name: { contains: search } } },
        { customer: { email: { contains: search } } },
      ];
    }

    // Tenant boundary: resellers only see accounts of their own customers.
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
      db.vpnAccount.count({ where }),
      db.vpnAccount.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          customer: { select: { id: true, name: true, email: true, customerCode: true } },
          server: { select: { id: true, name: true, publicIp: true, region: true, countryCode: true } },
          protocol: { select: { id: true, displayName: true, engine: true, key: true } },
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
    console.error("VPN accounts list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
