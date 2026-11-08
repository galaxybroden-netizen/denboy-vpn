// MVMP — Auth login endpoint
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, createSession, setSessionCookie, auditLog } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Email dan password wajib diisi" } },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_CREDENTIALS", message: "Email atau password salah" } },
        { status: 401 }
      );
    }

    if (user.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: { code: "ACCOUNT_DISABLED", message: "Akun dinonaktifkan, hubungi administrator" } },
        { status: 403 }
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_CREDENTIALS", message: "Email atau password salah" } },
        { status: 401 }
      );
    }

    // All roles allowed — AppShell routes to appropriate portal based on role

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";

    const session = await createSession(user.id, ip, ua);

    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "USER_LOGIN",
      resourceType: "User",
      resourceId: user.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: { method: "password", email: user.email },
    });

    const res = NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          mfaEnabled: user.mfaEnabled,
        },
      },
    });

    res.cookies.set(setSessionCookie(session.token));
    return res;
  } catch (e: any) {
    console.error("Login error:", e);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
