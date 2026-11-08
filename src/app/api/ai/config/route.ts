// MVMP — AI Center configuration (singleton)
// GET  : return the AIConfiguration record. If none exists, create one with the
//        schema defaults and return it.
// PATCH: update AIConfiguration fields. Audit log: AI_CONFIG_UPDATE.
//        SUPER_ADMIN / users with `ai.manage` can update.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

const ALLOWED_ROUTING_MODES = new Set([
  "free_first",
  "cheapest_first",
  "performance_first",
  "quality_first",
  "manual",
]);

async function getOrCreateConfig() {
  const existing = await db.aIConfiguration.findFirst();
  if (existing) return existing;
  return db.aIConfiguration.create({ data: {} });
}

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role, "ai.view")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat konfigurasi AI" } },
        { status: 403 }
      );
    }

    const config = await getOrCreateConfig();
    return NextResponse.json({ success: true, data: serialize(config) });
  } catch (e: any) {
    console.error("AI config GET error:", e?.message);
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
    if (!hasPermission(user.role, "ai.manage")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengubah konfigurasi AI" } },
        { status: 403 }
      );
    }

    const body = (await req.json()) || {};
    const config = await getOrCreateConfig();

    // Build the update payload from the whitelisted fields. Unknown keys are ignored.
    const data: any = { updatedBy: user.id };

    if (body.routingMode !== undefined) {
      const mode = String(body.routingMode);
      if (!ALLOWED_ROUTING_MODES.has(mode)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: `routingMode tidak valid. Pilihan: ${[...ALLOWED_ROUTING_MODES].join(", ")}`,
            },
          },
          { status: 400 }
        );
      }
      data.routingMode = mode;
    }

    // Boolean toggles
    if (body.chatbotEnabled !== undefined) data.chatbotEnabled = Boolean(body.chatbotEnabled);
    if (body.agentEnabled !== undefined) data.agentEnabled = Boolean(body.agentEnabled);
    if (body.streamingEnabled !== undefined) data.streamingEnabled = Boolean(body.streamingEnabled);
    if (body.emergencyShutdown !== undefined) data.emergencyShutdown = Boolean(body.emergencyShutdown);
    if (body.redactPII !== undefined) data.redactPII = Boolean(body.redactPII);
    if (body.redactCredentials !== undefined) data.redactCredentials = Boolean(body.redactCredentials);

    // Numeric cost controls
    if (body.dailyBudgetUsd !== undefined) data.dailyBudgetUsd = Number(body.dailyBudgetUsd);
    if (body.monthlyBudgetUsd !== undefined) data.monthlyBudgetUsd = Number(body.monthlyBudgetUsd);
    if (body.maxCostPerRequestUsd !== undefined) data.maxCostPerRequestUsd = Number(body.maxCostPerRequestUsd);
    if (body.maxCostPerUserUsd !== undefined) data.maxCostPerUserUsd = Number(body.maxCostPerUserUsd);
    if (body.tokenQuotaDaily !== undefined) data.tokenQuotaDaily = Number(body.tokenQuotaDaily);
    if (body.requestQuotaDaily !== undefined) data.requestQuotaDaily = Number(body.requestQuotaDaily);
    if (body.defaultTemperature !== undefined) data.defaultTemperature = Number(body.defaultTemperature);
    if (body.defaultMaxTokens !== undefined) data.defaultMaxTokens = Number(body.defaultMaxTokens);

    // Model selectors (optional — null is allowed to clear)
    if (body.defaultModelId !== undefined) data.defaultModelId = body.defaultModelId || null;
    if (body.chatbotModelId !== undefined) data.chatbotModelId = body.chatbotModelId || null;
    if (body.agentModelId !== undefined) data.agentModelId = body.agentModelId || null;
    if (body.reasoningModelId !== undefined) data.reasoningModelId = body.reasoningModelId || null;
    if (body.codingModelId !== undefined) data.codingModelId = body.codingModelId || null;
    if (body.fallbackModelId !== undefined) data.fallbackModelId = body.fallbackModelId || null;

    const updated = await db.aIConfiguration.update({
      where: { id: config.id },
      data,
    });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "AI_CONFIG_UPDATE",
      resourceType: "AIConfiguration",
      resourceId: updated.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        fields: Object.keys(data).filter((k) => k !== "updatedBy"),
        routingMode: updated.routingMode,
        chatbotEnabled: updated.chatbotEnabled,
        agentEnabled: updated.agentEnabled,
        emergencyShutdown: updated.emergencyShutdown,
      },
    });

    return NextResponse.json({ success: true, data: serialize(updated) });
  } catch (e: any) {
    console.error("AI config PATCH error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
