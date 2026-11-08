// MVMP — System settings (GET list / PATCH bulk update)
//
// Frontend never sees settings marked isSensitive=true (SMTP passwords, API secrets).
// SUPER_ADMIN can read & write all settings (including sensitive ones) — but the GET
// endpoint here still hides sensitive *values* by default to avoid accidental exposure
// in browser devtools / network logs. SUPER_ADMIN reads sensitive values via a separate
// dedicated secret-read endpoint if needed (out of scope here).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { hasPermissionDb } from "@/lib/rbac";

// Safe-parse a JSON-encoded setting value. Falls back to raw string on parse failure.
function parseValue(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// GET — list all system settings (excluding sensitive values)
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    // Any user with settings.view can list (sensitive values are masked out)
    const canView =
      user.role === "SUPER_ADMIN"
        ? await hasPermissionDb(user.id, "settings.view").catch(() => true)
        : hasPermission(user.role as any, "settings.view");
    if (!canView) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat pengaturan" } },
        { status: 403 }
      );
    }

    const rows = await db.systemSetting.findMany({
      orderBy: [{ category: "asc" }, { key: "asc" }],
    });

    // Exclude sensitive settings from the response entirely
    const items = rows
      .filter((r) => !r.isSensitive)
      .map((r) => ({
        id: r.id,
        key: r.key,
        value: parseValue(r.value),
        category: r.category,
        isSensitive: r.isSensitive,
      }));

    return NextResponse.json({
      success: true,
      data: serialize({ items }),
    });
  } catch (e: any) {
    console.error("System settings list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// PATCH — update multiple settings at once (SUPER_ADMIN + settings.manage only)
export async function PATCH(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }

    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Hanya SUPER_ADMIN yang dapat mengubah pengaturan sistem" } },
        { status: 403 }
      );
    }
    const canManage = await hasPermissionDb(user.id, "settings.manage");
    if (!canManage) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengubah pengaturan" } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { settings } = body || {};
    if (!Array.isArray(settings) || settings.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Body harus berisi { settings: [{ key, value }] }" } },
        { status: 400 }
      );
    }

    // Validate each entry shape
    for (const s of settings) {
      if (!s || typeof s.key !== "string" || s.value === undefined) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "Setiap item settings harus { key: string, value: any }" } },
          { status: 400 }
        );
      }
    }

    const keys = settings.map((s: any) => s.key);
    const existing = await db.systemSetting.findMany({
      where: { key: { in: keys } },
      select: { id: true, key: true, value: true, isSensitive: true, category: true },
    });
    const existingMap = new Map(existing.map((r) => [r.key, r]));

    // Reject updates to unknown keys (no auto-create here — settings keys must be seeded first)
    const unknown = keys.filter((k: string) => !existingMap.has(k));
    if (unknown.length) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: `Setting tidak dikenal: ${unknown.join(", ")}` } },
        { status: 400 }
      );
    }

    const now = new Date();
    const changed: Array<{ key: string; category: string; isSensitive: boolean }> = [];

    // Apply updates in a single transaction
    await db.$transaction(
      settings.map((s: any) => {
        const row = existingMap.get(s.key)!;
        changed.push({ key: s.key, category: row.category, isSensitive: row.isSensitive });
        // Value is JSON-stringified before storage (regardless of type — even strings get quoted JSON)
        const serializedValue = JSON.stringify(s.value);
        return db.systemSetting.update({
          where: { key: s.key },
          data: {
            value: serializedValue,
            updatedBy: user.id,
          },
        });
      })
    );

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "SYSTEM_SETTINGS_UPDATE",
      resourceType: "SystemSetting",
      resourceId: "bulk",
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        changedKeys: changed.map((c) => c.key),
        count: changed.length,
        sensitiveChanged: changed.filter((c) => c.isSensitive).map((c) => c.key),
      },
    });

    // Return updated settings (excluding sensitive values, matching GET shape)
    const updatedRows = await db.systemSetting.findMany({
      where: { key: { in: keys } },
      orderBy: [{ category: "asc" }, { key: "asc" }],
    });
    const items = updatedRows
      .filter((r) => !r.isSensitive)
      .map((r) => ({
        id: r.id,
        key: r.key,
        value: parseValue(r.value),
        category: r.category,
        isSensitive: r.isSensitive,
      }));

    return NextResponse.json({
      success: true,
      data: serialize({ items, updatedCount: changed.length }),
    });
  } catch (e: any) {
    console.error("System settings update error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
