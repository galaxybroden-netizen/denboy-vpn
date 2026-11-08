// MVMP — Server protocol action (start/stop/restart/install/uninstall/update)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { v4 as uuidv4 } from "uuid";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; protocolId: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role, "protocols.manage")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengelola protokol" } },
        { status: 403 }
      );
    }

    const { id: serverId, protocolId } = await params;
    const body = await req.json();
    const action = body?.action as string;

    const validActions = ["start", "stop", "restart", "install", "uninstall", "update"];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: `Action harus salah satu dari: ${validActions.join(", ")}` } },
        { status: 400 }
      );
    }

    const sp = await db.serverProtocol.findFirst({
      where: { serverId, protocolId },
      include: { protocol: { select: { displayName: true, key: true } }, server: { select: { name: true } } },
    });
    if (!sp) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Protokol server tidak ditemukan" } },
        { status: 404 }
      );
    }

    let newStatus = sp.status;
    let jobId: string | undefined;

    if (action === "install") {
      newStatus = "INSTALLING";
      const job = await db.job.create({
        data: {
          serverId,
          jobType: "protocol.install",
          payload: JSON.stringify({ protocolId, protocol: sp.protocol.key }),
          payloadHash: null,
          idempotencyKey: uuidv4(),
          status: "QUEUED",
          priority: 7,
        },
      });
      jobId = job.id;
    } else if (action === "uninstall") {
      // Mark UNINSTALLING first, then NOT_INSTALLED (best-effort simulation)
      newStatus = "UNINSTALLING";
    } else if (action === "update") {
      newStatus = "INSTALLING";
    } else if (action === "start") {
      newStatus = "RUNNING";
    } else if (action === "stop") {
      newStatus = "STOPPED";
    } else if (action === "restart") {
      newStatus = "RUNNING";
    }

    const updated = await db.serverProtocol.update({
      where: { id: sp.id },
      data: {
        status: newStatus,
        lastCheckedAt: new Date(),
        installedAt:
          action === "install" || (action === "start" && !sp.installedAt)
            ? new Date()
            : sp.installedAt,
      },
      include: {
        protocol: {
          select: { id: true, key: true, displayName: true, engine: true, isPremium: true },
        },
      },
    });

    // For uninstall — after marking UNINSTALLING, simulate moving to NOT_INSTALLED
    if (action === "uninstall") {
      await db.serverProtocol.update({
        where: { id: sp.id },
        data: { status: "NOT_INSTALLED", installedAt: null },
      });
    }

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: `PROTOCOL_${action.toUpperCase()}`,
      resourceType: "ServerProtocol",
      resourceId: sp.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        serverId,
        serverName: sp.server.name,
        protocolId,
        protocolKey: sp.protocol.key,
        newStatus,
        jobId,
      },
    });

    return NextResponse.json({
      success: true,
      data: serialize({ serverProtocol: updated, jobId }),
    });
  } catch (e: any) {
    console.error("Server protocol action error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
