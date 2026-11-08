// MVMP — RBAC roles list & create (SUPER_ADMIN only for POST)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { getRolesWithPermissions, hasPermissionDb } from "@/lib/rbac";

// GET — list all roles with their permission keys + user count
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    // SUPER_ADMIN always has access; others need settings.view (const-based fallback)
    const canView =
      user.role === "SUPER_ADMIN"
        ? true
        : hasPermission(user.role as any, "settings.view" as any);
    if (!canView) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat role" } },
        { status: 403 }
      );
    }

    const items = await getRolesWithPermissions();

    return NextResponse.json({
      success: true,
      data: serialize({ items }),
    });
  } catch (e: any) {
    console.error("RBAC roles list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// POST — create new custom role (SUPER_ADMIN only with rbac.manage)
export async function POST(req: NextRequest) {
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
        { success: false, error: { code: "FORBIDDEN", message: "Hanya SUPER_ADMIN yang dapat mengelola role" } },
        { status: 403 }
      );
    }
    const canManage = await hasPermissionDb(user.id, "rbac.manage");
    if (!canManage) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengelola role" } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { key, name, description, color, permissionKeys } = body || {};

    if (!key || !name) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: key, name" } },
        { status: 400 }
      );
    }

    const normalizedKey = String(key).toUpperCase().trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(normalizedKey)) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Key role harus huruf besar, angka, underscore, dan diawali huruf" } },
        { status: 400 }
      );
    }

    // Key must be unique
    const existing = await db.role.findUnique({ where: { key: normalizedKey } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: "ROLE_KEY_TAKEN", message: `Role dengan key "${normalizedKey}" sudah ada` } },
        { status: 400 }
      );
    }

    const keys: string[] = Array.isArray(permissionKeys) ? permissionKeys : [];
    // Resolve permission IDs from keys (skip invalid keys silently — caller should validate)
    const perms = keys.length
      ? await db.permission.findMany({ where: { key: { in: keys } }, select: { id: true, key: true } })
      : [];
    const foundKeys = new Set(perms.map((p) => p.key));
    const missingKeys = keys.filter((k: string) => !foundKeys.has(k));
    if (missingKeys.length) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: `Permission tidak dikenal: ${missingKeys.join(", ")}` } },
        { status: 400 }
      );
    }

    // Create role + RolePermission entries in one transaction
    const created = await db.role.create({
      data: {
        key: normalizedKey,
        name: String(name).trim(),
        description: description || null,
        color: color || "zinc",
        isSystem: false,
        rolePermissions: {
          create: perms.map((p) => ({ permissionId: p.id })),
        },
      },
      include: {
        rolePermissions: { include: { permission: { select: { key: true } } } },
        _count: { select: { users: true } },
      },
    });

    const shaped = {
      id: created.id,
      key: created.key,
      name: created.name,
      description: created.description,
      isSystem: created.isSystem,
      color: created.color,
      permissionKeys: created.rolePermissions.map((rp) => rp.permission.key),
      userCount: created._count.users,
    };

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "ROLE_CREATE",
      resourceType: "Role",
      resourceId: created.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        key: normalizedKey,
        name: created.name,
        color: created.color,
        permissionKeys: keys,
      },
    });

    return NextResponse.json(
      { success: true, data: serialize(shaped) },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("RBAC role create error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
