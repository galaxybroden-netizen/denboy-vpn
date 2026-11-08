// MVMP — API Keys (list & create)
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { getSessionUser, auditLog } from "@/lib/auth";

const MAX_KEYS_PER_USER = 10;
const VALID_SCOPES = new Set([
  "servers:read",
  "vpn-accounts:read",
  "vpn-accounts:write",
  "customers:read",
  "transactions:read",
  "monitoring:read",
]);

export async function GET() {
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

    const keys = await db.apiKey.findMany({
      where: { userId: user.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    const items = keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      scopes: safeParseScopes(k.scopes),
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt,
    }));

    return NextResponse.json({ success: true, data: { items } });
  } catch (e: any) {
    console.error("API keys list error:", e?.message);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL", message: "Terjadi kesalahan server" },
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
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

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const rawScopes = Array.isArray(body.scopes) ? body.scopes : [];
    const expiresAtRaw =
      typeof body.expiresAt === "string" ? body.expiresAt : null;

    if (!name || name.length < 1 || name.length > 100) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Nama harus diisi (1-100 karakter)",
          },
        },
        { status: 400 }
      );
    }

    // Sanitize & validate scopes
    const scopes = Array.from(
      new Set(rawScopes.filter((s: any) => typeof s === "string"))
    ) as string[];
    const invalid = scopes.filter((s) => !VALID_SCOPES.has(s));
    if (invalid.length) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `Scope tidak valid: ${invalid.join(", ")}`,
          },
        },
        { status: 400 }
      );
    }

    // Expiry: accept ISO string OR one of our preset durations
    let expiresAt: Date | null = null;
    if (expiresAtRaw && expiresAtRaw !== "never") {
      if (expiresAtRaw === "30d") {
        expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
      } else if (expiresAtRaw === "90d") {
        expiresAt = new Date(Date.now() + 90 * 24 * 3600 * 1000);
      } else if (expiresAtRaw === "1y") {
        expiresAt = new Date(Date.now() + 365 * 24 * 3600 * 1000);
      } else {
        const parsed = new Date(expiresAtRaw);
        if (isNaN(parsed.getTime())) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Format expiresAt tidak valid",
              },
            },
            { status: 400 }
          );
        }
        expiresAt = parsed;
      }
    }

    // Enforce max active keys per user
    const activeCount = await db.apiKey.count({
      where: { userId: user.id, revokedAt: null },
    });
    if (activeCount >= MAX_KEYS_PER_USER) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "LIMIT_EXCEEDED",
            message: `Maksimal ${MAX_KEYS_PER_USER} API key aktif per user`,
          },
        },
        { status: 400 }
      );
    }

    // Generate key material: mvmp_<32 hex> (40 chars total)
    const { fullKey, keyHash, keyPrefix } = generateKeyMaterial();

    let created: any = null;
    try {
      created = await db.apiKey.create({
        data: {
          userId: user.id,
          name,
          keyHash,
          keyPrefix,
          scopes: JSON.stringify(scopes),
          expiresAt,
        },
      });
    } catch (err: any) {
      // P2002 = unique constraint violation — retry once with fresh material
      if (err?.code === "P2002") {
        const retry = generateKeyMaterial();
        created = await db.apiKey.create({
          data: {
            userId: user.id,
            name,
            keyHash: retry.keyHash,
            keyPrefix: retry.keyPrefix,
            scopes: JSON.stringify(scopes),
            expiresAt,
          },
        });
        // Use the retry key for the response (client must receive the actual key)
        return finalize(req, user, created, retry.fullKey, scopes, expiresAt);
      }
      throw err;
    }

    return finalize(req, user, created, fullKey, scopes, expiresAt);
  } catch (e: any) {
    console.error("API key create error:", e?.message);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL", message: "Terjadi kesalahan server" },
      },
      { status: 500 }
    );
  }
}

function generateKeyMaterial() {
  const randomHex = crypto.randomBytes(16).toString("hex");
  const fullKey = `mvmp_${randomHex}`;
  const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");
  const keyPrefix = `${fullKey.slice(0, 12)}...`;
  return { fullKey, keyHash, keyPrefix };
}

async function finalize(
  req: NextRequest,
  user: { id: string; role: string },
  created: any,
  fullKey: string,
  scopes: string[],
  expiresAt: Date | null
) {
  const ip =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  await auditLog({
    actorUserId: user.id,
    actorType: user.role,
    action: "API_KEY_CREATED",
    resourceType: "ApiKey",
    resourceId: created.id,
    ipAddress: ip,
    userAgent: ua,
    metadata: {
      name: created.name,
      scopes,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    },
  });

  return NextResponse.json(
    {
      success: true,
      data: {
        id: created.id,
        name: created.name,
        keyPrefix: created.keyPrefix,
        scopes,
        fullKey,
        createdAt: created.createdAt,
      },
    },
    { status: 201 }
  );
}

function safeParseScopes(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
