// MVMP — Package update (PATCH)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengubah paket" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const {
      name, description, price, currency, durationDays, quotaBytes,
      maxDevices, isFeatured, status, allocationPolicy, protocolIds,
    } = body || {};

    const existing = await db.package.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Paket tidak ditemukan" } },
        { status: 404 }
      );
    }

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (price !== undefined) data.price = Number(price);
    if (currency !== undefined) data.currency = currency;
    if (durationDays !== undefined) data.durationDays = Number(durationDays);
    if (quotaBytes !== undefined) {
      data.quotaBytes = quotaBytes
        ? BigInt(typeof quotaBytes === "string" ? quotaBytes : String(quotaBytes))
        : null;
    }
    if (maxDevices !== undefined) data.maxDevices = Number(maxDevices);
    if (isFeatured !== undefined) data.isFeatured = Boolean(isFeatured);
    if (status !== undefined) data.status = status;
    if (allocationPolicy !== undefined) data.allocationPolicy = allocationPolicy;

    // Replace protocol associations if provided
    if (Array.isArray(protocolIds)) {
      await db.packageProtocol.deleteMany({ where: { packageId: id } });
      if (protocolIds.length) {
        await db.packageProtocol.createMany({
          data: protocolIds.map((pid: string) => ({ packageId: id, protocolId: pid })),
        });
      }
    }

    const updated = await db.package.update({
      where: { id },
      data,
      include: {
        protocols: { include: { protocol: { select: { id: true, key: true, displayName: true, engine: true } } } },
      },
    });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "PACKAGE_UPDATE",
      resourceType: "Package",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: { fields: Object.keys(data), protocolIdsReplaced: Array.isArray(protocolIds) },
    });

    return NextResponse.json({ success: true, data: serialize(updated) });
  } catch (e: any) {
    console.error("Package update error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// DELETE — remove package (blocked when still referenced by subscriptions)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin menghapus paket" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const existing = await db.package.findUnique({
      where: { id },
      include: { _count: { select: { subscriptions: true } } },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Paket tidak ditemukan" } },
        { status: 404 }
      );
    }
    if (existing._count.subscriptions > 0) {
      return NextResponse.json(
        { success: false, error: { code: "HAS_SUBSCRIPTIONS", message: `Tidak dapat menghapus: paket masih dipakai ${existing._count.subscriptions} subscription. Nonaktifkan saja.` } },
        { status: 409 }
      );
    }

    await db.package.delete({ where: { id } });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "DELETE_PACKAGE",
      resourceType: "Package",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: { packageName: existing.name },
    });

    return NextResponse.json({ success: true, data: { id, deleted: true } });
  } catch (e: any) {
    console.error("Package delete error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
