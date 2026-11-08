// MVMP — AI Center providers
// GET  : list all AIProvider records with model counts. apiKeyEncrypted is never
//        returned to the client — only the masked apiKeyPrefix + a hasApiKey flag.
// POST : create a new provider. If `apiKey` is provided in the body it is stored
//        as `apiKeyEncrypted` (AES-256-GCM encrypted via src/lib/crypto.ts)
//        and the prefix is computed as `first4 + "••••" + last4`.
//        Audit log: AI_PROVIDER_CREATE.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encrypt as aesEncrypt } from "@/lib/crypto";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

/**
 * Mask an API key for display. The schema convention is first 4 + "••••" + last 4
 * (4-dot separator) so the operator can identify the key without seeing the middle.
 */
function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

/**
 * Encrypt an API key for storage using AES-256-GCM (via src/lib/crypto.ts).
 * Falls back to base64 for legacy compatibility if encryption key is not available.
 */
function encodeApiKey(key: string): string {
  if (!key) return "";
  // Use AES-256-GCM encryption from crypto library
  const encrypted = aesEncrypt(key);
  if (encrypted) return encrypted;
  // Fallback: base64 (NOT secure — only if AI_ENCRYPTION_KEY is not set)
  try {
    return Buffer.from(key, "utf-8").toString("base64");
  } catch {
    return key;
  }
}

const ALLOWED_TYPES = new Set(["cloud", "local", "coding_agent"]);
const ALLOWED_AUTH = new Set(["bearer", "x-api-key", "query", "none"]);

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
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat AI provider" } },
        { status: 403 }
      );
    }

    const providers = await db.aIProvider.findMany({
      orderBy: [{ priority: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { models: true } },
      },
    });

    // Strip apiKeyEncrypted — frontend only sees apiKeyPrefix + hasApiKey.
    const sanitized = providers.map((p) => {
      const { apiKeyEncrypted, ...rest } = p;
      return {
        ...rest,
        apiKeyPresent: Boolean(apiKeyEncrypted),
      };
    });

    return NextResponse.json({ success: true, data: serialize(sanitized) });
  } catch (e: any) {
    console.error("AI providers list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
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
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin menambah AI provider" } },
        { status: 403 }
      );
    }

    const body = (await req.json()) || {};
    const {
      name,
      type,
      baseUrl,
      authType,
      apiKey,
      orgId,
      apiVersion,
      timeout,
      retryCount,
      rateLimitPerMin,
      priority,
      metadataJson,
      defaultModel,        // Phase 14: optional — auto-create a default AIModel row
      isActive,
    } = body;

    // Validation
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: name" } },
        { status: 400 }
      );
    }
    if (!type || !ALLOWED_TYPES.has(String(type))) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: `type harus salah satu dari: ${[...ALLOWED_TYPES].join(", ")}` } },
        { status: 400 }
      );
    }
    if (!baseUrl || typeof baseUrl !== "string" || !baseUrl.trim()) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: baseUrl" } },
        { status: 400 }
      );
    }

    const auth = authType && ALLOWED_AUTH.has(String(authType)) ? String(authType) : "bearer";

    // Uniqueness check — name is unique in the schema
    const existing = await db.aIProvider.findUnique({ where: { name: name.trim() } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: "DUPLICATE", message: `Provider dengan nama "${name.trim()}" sudah ada` } },
        { status: 409 }
      );
    }

    // Build create payload — only set apiKeyEncrypted/apiKeyPrefix when apiKey supplied
    const data: any = {
      name: name.trim(),
      type,
      baseUrl: baseUrl.trim(),
      authType: auth,
      orgId: orgId ?? null,
      apiVersion: apiVersion ?? null,
      timeout: timeout !== undefined ? Number(timeout) : 30,
      retryCount: retryCount !== undefined ? Number(retryCount) : 2,
      rateLimitPerMin: rateLimitPerMin !== undefined ? Number(rateLimitPerMin) : 60,
      priority: priority !== undefined ? Number(priority) : 100,
      isActive: typeof isActive === "boolean" ? isActive : false,
    };
    // Phase 14: store default model config + providerType hint in metadataJson
    if (metadataJson && typeof metadataJson === "string") {
      try {
        JSON.parse(metadataJson); // validate
        data.metadataJson = metadataJson;
      } catch {
        // ignore invalid JSON
      }
    }
    if (apiKey && typeof apiKey === "string" && apiKey.trim()) {
      data.apiKeyEncrypted = encodeApiKey(apiKey);
      data.apiKeyPrefix = maskApiKey(apiKey);
    }

    const provider = await db.aIProvider.create({
      data,
      include: { _count: { select: { models: true } } },
    });

    // Phase 14: optionally auto-create a default AIModel row
    if (defaultModel && typeof defaultModel === "object" && defaultModel.modelId) {
      try {
        await db.aIModel.create({
          data: {
            providerId: provider.id,
            modelId: String(defaultModel.modelId),
            displayName: String(defaultModel.displayName || defaultModel.modelId),
            description: defaultModel.description || null,
            category: String(defaultModel.category || "custom"),
            contextWindow: Number(defaultModel.contextWindow) || 4096,
            maxOutputTokens: Number(defaultModel.maxOutputTokens) || 2048,
            inputPricePer1M: Number(defaultModel.inputPricePer1M) || 0,
            outputPricePer1M: Number(defaultModel.outputPricePer1M) || 0,
            isFree: Boolean(defaultModel.isFree),
            defaultTemp: Number(defaultModel.defaultTemp) || 0.7,
            defaultMaxTokens: Number(defaultModel.maxOutputTokens) || 2048,
            recommendedUse: defaultModel.recommendedUse || null,
            isActive: true,
          },
        });
      } catch (modelErr: any) {
        // Don't fail the provider creation if model creation fails
        console.warn("Auto-create default model failed:", modelErr?.message);
      }
    }

    // Strip apiKeyEncrypted before returning
    const { apiKeyEncrypted, ...sanitized } = provider;

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "AI_PROVIDER_CREATE",
      resourceType: "AIProvider",
      resourceId: provider.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        name: provider.name,
        type: provider.type,
        baseUrl: provider.baseUrl,
        authType: provider.authType,
        hasApiKey: Boolean(apiKey),
      },
    });

    return NextResponse.json(
      { success: true, data: serialize({ ...sanitized, apiKeyPresent: Boolean(apiKeyEncrypted) }) },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("AI provider create error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
