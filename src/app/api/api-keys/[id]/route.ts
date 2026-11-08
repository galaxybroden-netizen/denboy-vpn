// MVMP — API Key revoke (DELETE)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, auditLog } from "@/lib/auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" },
        },
        { status: 401 }
      );
    }

    const { id } = await params;

    const existing = await db.apiKey.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "API key tidak ditemukan" },
        },
        { status: 404 }
      );
    }

    // Ownership check — only the owner can revoke their own keys
    if (existing.userId !== user.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Anda tidak memiliki izin mencabut API key ini",
          },
        },
        { status: 403 }
      );
    }

    if (existing.revokedAt) {
      // Idempotent — already revoked
      return NextResponse.json({ success: true, data: { id } });
    }

    await db.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    const ip =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "API_KEY_REVOKED",
      resourceType: "ApiKey",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: { name: existing.name, keyPrefix: existing.keyPrefix },
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (e: any) {
    console.error("API key revoke error:", e?.message);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL", message: "Terjadi kesalahan server" },
      },
      { status: 500 }
    );
  }
}
