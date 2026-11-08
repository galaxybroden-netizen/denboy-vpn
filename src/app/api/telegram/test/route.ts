// MVMP — Telegram test connection
// POST — test bot connection by calling getMe
//   1. Load config from DB
//   2. Decrypt bot token
//   3. Call Telegram getMe API
//   4. Update config with bot info (botName, botUsername, status, lastConnectedAt)
//   5. Return bot info

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { decrypt as aesDecrypt } from "@/lib/crypto";
import { getMe } from "@/lib/telegram";
import { serialize } from "@/lib/utils-mvmp";

export async function POST(req: NextRequest) {
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
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } },
        { status: 403 }
      );
    }

    let config = await db.telegramIntegration.findFirst();
    if (!config) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_CONFIGURED", message: "Konfigurasi Telegram belum diatur. Masukkan Bot Token terlebih dahulu." } },
        { status: 400 }
      );
    }

    if (!config.botTokenEncrypted) {
      return NextResponse.json(
        { success: false, error: { code: "NO_TOKEN", message: "Bot Token belum diatur" } },
        { status: 400 }
      );
    }

    // Decrypt token
    const token = aesDecrypt(config.botTokenEncrypted);
    if (!token) {
      return NextResponse.json(
        { success: false, error: { code: "DECRYPT_FAILED", message: "Gagal mendekripsi token. Periksa AI_ENCRYPTION_KEY." } },
        { status: 500 }
      );
    }

    // Call Telegram getMe
    const botInfo = await getMe(token);

    // Update config with bot info
    const updated = await db.telegramIntegration.update({
      where: { id: config.id },
      data: {
        botName: botInfo.first_name,
        botUsername: botInfo.username,
        status: "connected",
        lastConnectedAt: new Date(),
        lastError: null,
        isActive: true,
      },
    });

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "TELEGRAM_TEST_CONNECTION",
      resourceType: "TelegramIntegration",
      resourceId: updated.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        botName: botInfo.first_name,
        botUsername: botInfo.username,
        botId: botInfo.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        botName: botInfo.first_name,
        botUsername: botInfo.username,
        botId: botInfo.id,
        status: "connected",
        lastConnectedAt: updated.lastConnectedAt,
      },
    });
  } catch (e: any) {
    // Update error in DB
    try {
      const config = await db.telegramIntegration.findFirst();
      if (config) {
        await db.telegramIntegration.update({
          where: { id: config.id },
          data: { status: "error", lastError: e?.message || "Connection failed" },
        });
      }
    } catch {}

    return NextResponse.json(
      { success: false, error: { code: "CONNECTION_FAILED", message: e?.message || "Gagal terhubung ke Telegram" } },
      { status: 502 }
    );
  }
}
