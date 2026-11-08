// MVMP — Email log detail & delete (admin)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
    { status: 401 }
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();
    if (!hasPermission(user.role, "settings.view")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat log email" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const log = await db.emailLog.findUnique({ where: { id } });
    if (!log) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Log email tidak ditemukan" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: log });
  } catch (e: any) {
    console.error("Email log detail error:", e?.message);
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
    if (!user) return unauthorized();
    if (!hasPermission(user.role, "settings.manage")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin menghapus log email" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const log = await db.emailLog.findUnique({ where: { id } });
    if (!log) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Log email tidak ditemukan" } },
        { status: 404 }
      );
    }

    await db.emailLog.delete({ where: { id } });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "DELETE_EMAIL_LOG",
      resourceType: "EmailLog",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: { subject: log.subject, toEmail: log.toEmail },
    });

    return NextResponse.json({ success: true, data: { id, deleted: true } });
  } catch (e: any) {
    console.error("Email log delete error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
