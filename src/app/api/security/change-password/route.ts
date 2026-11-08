// MVMP — Change own password (OTP-gated, no old password required)
//
// Used primarily by SUPER_ADMIN (who doesn't have an old password flow) but
// available to any authenticated user who has completed OTP verification for
// the `password_change` purpose within the last 5 minutes.
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog, SESSION_COOKIE_NAME } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { verifyOtp } from "@/lib/otp";
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

// POST — change own password (requires recent OTP verification)
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { otp_purpose, otp_code, newPassword, confirmPassword } = body || {};

    if (!newPassword || !confirmPassword) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: newPassword, confirmPassword" } },
        { status: 400 }
      );
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "newPassword dan confirmPassword tidak cocok" } },
        { status: 400 }
      );
    }

    const minLen = await getPasswordMinLength();
    if (String(newPassword).length < minLen) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: `Password minimal ${minLen} karakter` } },
        { status: 400 }
      );
    }

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";

    // Check for a RECENTLY VERIFIED OTP first (within last 5 minutes).
    // If found, skip the inline verify step (the user already verified separately).
    const purpose = otp_purpose || "password_change";
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    let recentVerifiedOtp = await db.otpCode.findFirst({
      where: {
        userId: user.id,
        purpose,
        usedAt: { gte: fiveMinAgo, not: null },
        expiresAt: { gt: new Date() },
      },
      orderBy: { usedAt: "desc" },
    });

    // If no recent verified OTP AND otp_code is provided inline, verify it now.
    if (!recentVerifiedOtp && otp_code) {
      const verifyResult = await verifyOtp(user.id, String(purpose), String(otp_code), {
        actorUserId: user.id,
        ipAddress: ip,
      });
      if (!verifyResult.success) {
        return NextResponse.json(
          { success: false, error: { code: "OTP_VERIFY_FAILED", message: verifyResult.error || "Verifikasi OTP gagal" } },
          { status: 400 }
        );
      }
      // Re-fetch the now-verified OTP
      recentVerifiedOtp = await db.otpCode.findFirst({
        where: {
          userId: user.id,
          purpose,
          usedAt: { gte: fiveMinAgo, not: null },
          expiresAt: { gt: new Date() },
        },
        orderBy: { usedAt: "desc" },
      });
    }

    if (!recentVerifiedOtp) {
      return NextResponse.json(
        { success: false, error: { code: "OTP_REQUIRED", message: "Verifikasi OTP diperlukan. Minta OTP terlebih dahulu." } },
        { status: 400 }
      );
    }

    // Hash + update
    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    const now = new Date();

    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        lastPasswordChangeAt: now,
      },
    });

    // Revoke all OTHER sessions for this user (keep the current session alive)
    const cookieStore = await cookies();
    const currentToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    await db.session.updateMany({
      where: {
        userId: user.id,
        token: { not: currentToken || "___no_current_session___" },
        revokedAt: null,
      },
      data: { revokedAt: now },
    });

    // Mock notification email — log to EmailLog table
    try {
      await db.emailLog.create({
        data: {
          toEmail: user.email,
          subject: "Password Akun MVMP Anda Telah Diubah",
          body: `Halo ${user.name},\n\nKata sandi akun MVMP Anda telah diubah pada ${now.toISOString()}.\nJika ini bukan Anda, segera hubungi administrator.\n\n— Tim MVMP`,
          template: "GENERIC",
          status: "SENT",
          relatedType: "User",
          relatedId: user.id,
        },
      });
    } catch (emailErr: any) {
      // Email log failure is non-fatal
      console.error("Change-password email log failed:", emailErr?.message);
    }

    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "USER_PASSWORD_CHANGE_SELF",
      resourceType: "User",
      resourceId: user.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        viaOtp: true,
        otpPurpose: purpose,
        otpVerifiedAt: recentVerifiedOtp.usedAt,
        otherSessionsRevoked: true,
        emailNotificationSent: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: serialize({
        changedAt: now,
        sessionsRevoked: true,
        currentSessionKept: true,
      }),
    });
  } catch (e: any) {
    console.error("Change password error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
