// MVMP — OTP request (any authenticated user, for themselves)
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { requestOtp } from "@/lib/otp";

// POST — request OTP for the authenticated user
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
    const { purpose, channel } = body || {};

    if (!purpose || typeof purpose !== "string") {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: purpose" } },
        { status: 400 }
      );
    }

    // Validate channel value if provided
    const ch: "email" | "phone" =
      channel === "phone" ? "phone" : channel === "email" ? "email" : "email";

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";

    // requestOtp() internally audits `OTP_REQUESTED` (without plaintext mockOtp)
    const result = await requestOtp(user.id, purpose, ch, {
      actorUserId: user.id,
      ipAddress: ip,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "OTP_REQUEST_FAILED", message: result.error || "Gagal meminta OTP" } },
        { status: 400 }
      );
    }

    // Sandbox: mockOtp is returned by requestOtp() for dev visibility (visible in email log too).
    // In production the OTP library would not include mockOtp — only real delivery via SMTP/SMS.
    return NextResponse.json({
      success: true,
      data: serialize({
        otpId: result.otpId,
        channel: result.channel,
        sentTo: result.sentTo,
        expiresAt: result.expiresAt,
        mockOtp: result.mockOtp, // undefined in production
      }),
    });
  } catch (e: any) {
    console.error("OTP request error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
