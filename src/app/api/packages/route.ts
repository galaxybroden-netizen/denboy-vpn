// MVMP — Packages list & create
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
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
    if (!hasPermission(user.role, "packages.view")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat paket" } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const where: any = {};
    if (status) where.status = status;

    const packages = await db.package.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        protocols: { include: { protocol: { select: { id: true, key: true, displayName: true, engine: true, isEnabled: true } } } },
        _count: {
          select: {
            subscriptions: true,
            protocols: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: serialize({ items: packages }) });
  } catch (e: any) {
    console.error("Packages list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role, "packages.manage")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin menambah paket" } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      name, description, price, currency, durationDays, quotaBytes,
      maxDevices, isFeatured, protocolIds,
    } = body || {};

    if (!name || price === undefined || !durationDays) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: name, price, durationDays" } },
        { status: 400 }
      );
    }

    const quota = quotaBytes
      ? BigInt(typeof quotaBytes === "string" ? quotaBytes : String(quotaBytes))
      : null;

    const pkg = await db.package.create({
      data: {
        name,
        description: description || null,
        price: Number(price),
        currency: currency || "IDR",
        durationDays: Number(durationDays),
        quotaBytes: quota,
        maxDevices: Number(maxDevices) || 3,
        isFeatured: Boolean(isFeatured),
        protocols: protocolIds?.length
          ? {
              create: protocolIds.map((pid: string) => ({ protocolId: pid })),
            }
          : undefined,
      },
      include: {
        protocols: { include: { protocol: true } },
      },
    });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "PACKAGE_CREATE",
      resourceType: "Package",
      resourceId: pkg.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: { name: pkg.name, price: pkg.price, currency: pkg.currency },
    });

    return NextResponse.json({ success: true, data: serialize(pkg) }, { status: 201 });
  } catch (e: any) {
    console.error("Package create error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
