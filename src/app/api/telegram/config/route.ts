// MVMP — Telegram Integration config API
// GET  — get current Telegram integration config (token masked)
// PATCH — update config (encrypt token if provided)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { encrypt as aesEncrypt } from "@/lib/crypto";
import { serialize } from "@/lib/utils-mvmp";
import { maskBotToken } from "@/lib/telegram";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role as any, "ai.view" as any)) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } },
        { status: 403 }
      );
    }

    // Singleton — first row or create empty
    let config = await db.telegramIntegration.findFirst();
    if (!config) {
      config = await db.telegramIntegration.create({ data: {} });
    }

    // Strip encrypted token — return prefix only
    const { botTokenEncrypted, ...safe } = config;
    return NextResponse.json({
      success: true,
      data: serialize({ ...safe, hasToken: Boolean(botTokenEncrypted) }),
    });
  } catch (e: any) {
    console.error("Telegram config GET error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role as any, "ai.manage" as any) && user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengubah konfigurasi Telegram" } },
        { status: 403 }
      );
    }

    const body = await req.json();

    // Get or create singleton
    let config = await db.telegramIntegration.findFirst();
    if (!config) {
      config = await db.telegramIntegration.create({ data: {} });
    }

    const data: any = {};
    // Bot token — only update if provided (non-empty)
    if (body.botToken !== undefined && typeof body.botToken === "string" && body.botToken.trim()) {
      const token = body.botToken.trim();
      const encrypted = aesEncrypt(token);
      if (encrypted) {
        data.botTokenEncrypted = encrypted;
        data.botTokenPrefix = maskBotToken(token);
      }
    }
    if (body.webhookUrl !== undefined) data.webhookUrl = body.webhookUrl?.trim() || null;
    if (body.webhookSecret !== undefined) data.webhookSecret = body.webhookSecret?.trim() || null;
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
    if (body.defaultAgentId !== undefined) data.defaultAgentId = body.defaultAgentId?.trim() || null;
    if (body.defaultModelId !== undefined) data.defaultModelId = body.defaultModelId?.trim() || null;
    if (body.defaultKbId !== undefined) data.defaultKbId = body.defaultKbId?.trim() || null;
    if (body.allowedUserIds !== undefined) {
      data.allowedUserIds = Array.isArray(body.allowedUserIds)
        ? JSON.stringify(body.allowedUserIds)
        : null;
    }

    const updated = await db.telegramIntegration.update({
      where: { id: config.id },
      data,
    });

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "TELEGRAM_CONFIG_UPDATE",
      resourceType: "TelegramIntegration",
      resourceId: updated.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        hasToken: Boolean(updated.botTokenEncrypted),
        webhookUrl: updated.webhookUrl,
        isActive: updated.isActive,
      },
    });

    const { botTokenEncrypted, ...safe } = updated;
    return NextResponse.json({
      success: true,
      data: serialize({ ...safe, hasToken: Boolean(botTokenEncrypted) }),
    });
  } catch (e: any) {
    console.error("Telegram config PATCH error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
