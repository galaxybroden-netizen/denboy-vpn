// MVMP — Admin reset user password (SUPER_ADMIN only)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { hasPermissionDb } from "@/lib/rbac";
import bcrypt from "bcryptjs";

// Read password min length from SystemSetting (fallback 8)
async function getPasswordMinLength(): Promise<number> {
  try {
    const row = await db.systemSetting.findUnique({ where: { key: "security.password_min_length" } });
    if (!row) return 8;
    const parsed = JSON.parse(row.value);
    return typeof parsed === "number" && parsed >= 6 ? parsed : 8;
  } catch {
    return 8;
  }
}

// POST — admin reset user password (no old password required)
export async function POST(
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

    // SUPER_ADMIN protection
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Hanya SUPER_ADMIN yang dapat mengelola pengguna" } },
        { status: 403 }
      );
    }
    const canReset = await hasPermissionDb(user.id, "users.reset_password");
    if (!canReset) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin reset password pengguna" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const { newPassword } = body || {};

    if (!newPassword || typeof newPassword !== "string") {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: newPassword" } },
        { status: 400 }
      );
    }

    const minLen = await getPasswordMinLength();
    if (newPassword.length < minLen) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: `Password minimal ${minLen} karakter` } },
        { status: 400 }
      );
    }

    const target = await db.user.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Pengguna tidak ditemukan" } },
        { status: 404 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const now = new Date();

    // Update password + revoke all sessions in one transaction
    await db.$transaction([
      db.user.update({
        where: { id },
        data: {
          passwordHash,
          lastPasswordChangeAt: now,
        },
      }),
      db.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "USER_PASSWORD_RESET",
      resourceType: "User",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        targetUsername: target.username,
        targetEmail: target.email,
        sessionsRevoked: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: serialize({ id, resetAt: now }),
    });
  } catch (e: any) {
    console.error("User password reset error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
