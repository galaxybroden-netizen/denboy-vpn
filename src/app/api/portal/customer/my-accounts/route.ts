// MVMP — Customer Portal: list own VPN accounts
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
    const statusParam = searchParams.get("status")?.trim().toUpperCase() || "ACTIVE";

    const where: any = { customerId: customer.id };
    if (statusParam && statusParam !== "ALL") {
      where.status = statusParam;
    }

    const accounts = await db.vpnAccount.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        server: {
          select: { id: true, name: true, publicIp: true, region: true, countryCode: true },
        },
        protocol: { select: { id: true, key: true, displayName: true, engine: true } },
        credentials: {
          select: { id: true, credentialType: true, publicValue: true, keyVersion: true },
        },
        usage: {
          orderBy: { recordedAt: "desc" },
          take: 5,
          select: { uploadBytes: true, downloadBytes: true, totalBytes: true, recordedAt: true },
        },
      },
    });

    // Compute usage percent
    const items = accounts.map((a) => {
      const used = Number(a.uploadBytes + a.downloadBytes);
      const limit = a.quotaBytes ? Number(a.quotaBytes) : 0;
      const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
      return {
        id: a.id,
        username: a.username,
        status: a.status,
        quotaBytes: a.quotaBytes,
        uploadBytes: a.uploadBytes,
        downloadBytes: a.downloadBytes,
        expiresAt: a.expiresAt,
        maxDevices: a.maxDevices,
        createdAt: a.createdAt,
        provisionedAt: a.provisionedAt,
        server: a.server,
        protocol: a.protocol,
        credentials: a.credentials,
        usage: a.usage,
        quotaUsed: used,
        quotaLimit: limit,
        quotaUsagePercent: percent,
      };
    });

    return NextResponse.json({
      success: true,
      data: serialize({
        items,
        count: items.length,
        filter: statusParam,
      }),
    });
  } catch (e: any) {
    console.error("Customer my-accounts error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
