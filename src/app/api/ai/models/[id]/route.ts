// MVMP — AI Model detail: GET, PATCH (update), DELETE
//
// PATCH — update model config (displayName, description, category, contextWindow,
//          maxOutputTokens, pricing, temperature, isActive, recommendedUse, dll)
// DELETE — delete model with dependency check:
//   1. Check if model is referenced in AIConfiguration (chatbotModelId, agentModelId, etc.)
//   2. Check if model has AIUsage records
//   3. If dependencies exist, return 409 Conflict with dependency info
//   4. If safe, delete model (AIUsage records will be orphaned but kept for history)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

// Allowed categories
const ALLOWED_CATEGORIES = new Set([
  "free", "free_local", "paid", "premium", "reasoning", "coding", "fast", "multimodal", "custom",
]);

// GET — model detail
export async function GET(
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
    if (!hasPermission(user.role as any, "ai.view" as any)) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat AI model" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const model = await db.aIModel.findUnique({
      where: { id },
      include: {
        provider: {
          select: { id: true, name: true, type: true, isActive: true },
        },
        _count: { select: { usage: true } },
      },
    });

    if (!model) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Model tidak ditemukan" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: serialize(model) });
  } catch (e: any) {
    console.error("AI model GET error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// PATCH — update model
export async function PATCH(
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
    if (!hasPermission(user.role as any, "ai.manage" as any) && user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengubah AI model" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();

    const existing = await db.aIModel.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Model tidak ditemukan" } },
        { status: 404 }
      );
    }

    // Build update data — only allow specific fields
    const data: any = {};
    if (body.displayName !== undefined) {
      const v = String(body.displayName).trim();
      if (!v) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "displayName tidak boleh kosong" } }, { status: 400 });
      data.displayName = v;
    }
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.category !== undefined) {
      const v = String(body.category);
      if (!ALLOWED_CATEGORIES.has(v)) {
        return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: `category harus salah satu: ${[...ALLOWED_CATEGORIES].join(", ")}` } }, { status: 400 });
      }
      data.category = v;
    }
    if (body.contextWindow !== undefined) data.contextWindow = Number(body.contextWindow) || 4096;
    if (body.maxOutputTokens !== undefined) data.maxOutputTokens = Number(body.maxOutputTokens) || 2048;
    if (body.inputPricePer1M !== undefined) data.inputPricePer1M = Number(body.inputPricePer1M) || 0;
    if (body.outputPricePer1M !== undefined) data.outputPricePer1M = Number(body.outputPricePer1M) || 0;
    if (body.currency !== undefined) data.currency = String(body.currency) || "USD";
    if (body.isFree !== undefined) data.isFree = Boolean(body.isFree);
    if (body.capabilities !== undefined) data.capabilities = body.capabilities || null;
    if (body.defaultTemp !== undefined) data.defaultTemp = Number(body.defaultTemp) || 0.7;
    if (body.defaultMaxTokens !== undefined) data.defaultMaxTokens = Number(body.defaultMaxTokens) || 2048;
    if (body.rateLimitPerMin !== undefined) data.rateLimitPerMin = Number(body.rateLimitPerMin) || 60;
    if (body.recommendedUse !== undefined) data.recommendedUse = body.recommendedUse?.trim() || null;
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

    // modelId and providerId are NOT editable — they define the model identity

    const updated = await db.aIModel.update({
      where: { id },
      data,
      include: {
        provider: { select: { id: true, name: true, type: true, isActive: true } },
      },
    });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "AI_MODEL_UPDATE",
      resourceType: "AIModel",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        modelId: updated.modelId,
        displayName: updated.displayName,
        changedFields: Object.keys(data),
      },
    });

    return NextResponse.json({ success: true, data: serialize(updated) });
  } catch (e: any) {
    console.error("AI model PATCH error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// DELETE — delete model with dependency check
export async function DELETE(
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
    if (!hasPermission(user.role as any, "ai.manage" as any) && user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin menghapus AI model" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const existing = await db.aIModel.findUnique({
      where: { id },
      include: {
        provider: { select: { name: true } },
        _count: { select: { usage: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Model tidak ditemukan" } },
        { status: 404 }
      );
    }

    // Dependency check: is this model referenced in AIConfiguration?
    const config = await db.aIConfiguration.findFirst();
    const dependencies: string[] = [];
    if (config) {
      if (config.defaultModelId === id) dependencies.push("AIConfiguration.defaultModelId");
      if (config.chatbotModelId === id) dependencies.push("AIConfiguration.chatbotModelId");
      if (config.agentModelId === id) dependencies.push("AIConfiguration.agentModelId");
      if (config.reasoningModelId === id) dependencies.push("AIConfiguration.reasoningModelId");
      if (config.codingModelId === id) dependencies.push("AIConfiguration.codingModelId");
      if (config.fallbackModelId === id) dependencies.push("AIConfiguration.fallbackModelId");
    }

    if (dependencies.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CONFLICT",
            message: `Model "${existing.displayName}" tidak dapat dihapus karena masih digunakan sebagai: ${dependencies.join(", ")}. Ubah konfigurasi terlebih dahulu sebelum menghapus.`,
            dependencies,
          },
        },
        { status: 409 }
      );
    }

    // Check if model has usage records — warn but allow delete (usage kept for history)
    const usageCount = existing._count?.usage ?? 0;
    if (usageCount > 0) {
      // Set modelId to null in usage records before delete (orphan-safe)
      // Actually, AIUsage.modelId is optional (String?), so we can just delete the model
      // Prisma will NOT cascade delete usage records (no onDelete: Cascade in AIUsage)
      // But it may fail if there's a foreign key constraint without cascade
      // Check schema: AIUsage has modelId String? with relation to AIModel
      // If relation exists without onDelete: Cascade, we need to nullify first
      try {
        await db.aIUsage.updateMany({
          where: { modelId: id },
          data: { modelId: null },
        });
      } catch {
        // If updateMany fails (maybe modelId is required), we can't delete safely
        // But schema says modelId is optional (String?), so this should work
      }
    }

    // Delete model
    await db.aIModel.delete({ where: { id } });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "AI_MODEL_DELETE",
      resourceType: "AIModel",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        modelId: existing.modelId,
        displayName: existing.displayName,
        providerName: existing.provider?.name,
        usageRecordsOrphaned: usageCount,
      },
    });

    return NextResponse.json({
      success: true,
      data: { id, deleted: true, orphanedUsageRecords: usageCount },
    });
  } catch (e: any) {
    console.error("AI model DELETE error:", e?.message);
    // Handle Prisma foreign key constraint error
    if (e?.code === "P2003") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CONFLICT",
            message: "Model tidak dapat dihapus karena masih memiliki relasi data. Hapus atau nullify relasi terlebih dahulu.",
          },
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
