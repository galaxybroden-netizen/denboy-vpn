// MVMP — OTP verify (any authenticated user, for themselves)
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { verifyOtp } from "@/lib/otp";

// POST — verify OTP submitted by user
//
// On success, the underlying OtpCode row is marked `usedAt = now()` (single-use).
// Downstream sensitive endpoints (e.g. change-password) verify the recent OTP
// themselves by querying OtpCode where userId+purpose AND usedAt within last 5 min.
// This avoids needing to share a separate verifiedToken across requests.
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
    const { purpose, code } = body || {};

    if (!purpose || !code) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: purpose, code" } },
        { status: 400 }
      );
    }

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";

    // verifyOtp() internally audits `OTP_VERIFIED` on success (or increments attempts on failure)
    const result = await verifyOtp(user.id, String(purpose), String(code), {
      actorUserId: user.id,
      ipAddress: ip,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "OTP_VERIFY_FAILED", message: result.error || "Verifikasi OTP gagal" } },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: serialize({
        verifiedOtpId: result.verifiedOtpId,
        purpose,
        verifiedAt: new Date(),
        // Calling endpoint should verify by checking OtpCode.usedAt within last 5 min
        validForSeconds: 300,
      }),
    });
  } catch (e: any) {
    console.error("OTP verify error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
