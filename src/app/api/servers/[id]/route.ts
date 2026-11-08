// MVMP — Server detail (GET, PATCH, DELETE)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

export async function GET(
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
    if (!hasPermission(user.role, "servers.view")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat server" } },
        { status: 403 }
      );
    }

    const { id } = await params;

    const since = new Date(Date.now() - 24 * 3600 * 1000);

    const server = await db.server.findUnique({
      where: { id },
      include: {
        agent: true,
        group: { select: { id: true, name: true, description: true } },
        protocols: { include: { protocol: true } },
        serverPorts: true,
        firewallRules: true,
        _count: { select: { vpnAccounts: true } },
      },
    });

    if (!server) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Server tidak ditemukan" } },
        { status: 404 }
      );
    }

    // vpn accounts count by status
    const vpnByStatus = await db.vpnAccount.groupBy({
      by: ["status"],
      where: { serverId: id },
      _count: true,
    });
    const vpnStatusMap: Record<string, number> = {};
    for (const v of vpnByStatus) vpnStatusMap[v.status] = v._count;

    // last 24h metrics
    const metrics = await db.serverMetric.findMany({
      where: { serverId: id, recordedAt: { gte: since } },
      orderBy: { recordedAt: "desc" },
      take: 200,
    });

    return NextResponse.json({
      success: true,
      data: serialize({
        ...server,
        vpnAccountsByStatus: vpnStatusMap,
        metrics24h: metrics,
      }),
    });
  } catch (e: any) {
    console.error("Server detail error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

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
    if (!hasPermission(user.role, "servers.manage")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengubah server" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const { name, hostname, region, maxAccounts, maintenanceMode, status } = body || {};

    const existing = await db.server.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Server tidak ditemukan" } },
        { status: 404 }
      );
    }

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (hostname !== undefined) data.hostname = hostname;
    if (region !== undefined) data.region = region;
    if (maxAccounts !== undefined) data.maxAccounts = Number(maxAccounts);
    if (maintenanceMode !== undefined) data.maintenanceMode = Boolean(maintenanceMode);
    if (status !== undefined) data.status = status;

    const updated = await db.server.update({
      where: { id },
      data,
      include: { group: { select: { id: true, name: true } } },
    });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "SERVER_UPDATE",
      resourceType: "Server",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: { fields: Object.keys(data) },
    });

    return NextResponse.json({ success: true, data: serialize(updated) });
  } catch (e: any) {
    console.error("Server update error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

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
    if (!hasPermission(user.role, "servers.manage")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin menghapus server" } },
        { status: 403 }
      );
    }

    const { id } = await params;

    const existing = await db.server.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Server tidak ditemukan" } },
        { status: 404 }
      );
    }

    // Soft delete by setting status to DECOMMISSIONED
    const updated = await db.server.update({
      where: { id },
      data: { status: "DECOMMISSIONED", maintenanceMode: true },
    });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "SERVER_DECOMMISSION",
      resourceType: "Server",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: { name: existing.name, hostname: existing.hostname },
    });

    return NextResponse.json({
      success: true,
      data: serialize({ id: updated.id, status: updated.status }),
    });
  } catch (e: any) {
    console.error("Server delete error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
