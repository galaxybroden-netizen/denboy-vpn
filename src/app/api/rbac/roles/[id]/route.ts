// MVMP — RBAC role detail (PATCH permissions / DELETE role) — SUPER_ADMIN only
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { updateRolePermissions, hasPermissionDb } from "@/lib/rbac";

// Common SUPER_ADMIN + rbac.manage gate
async function ensureCanManageRoles(user: any): Promise<NextResponse | null> {
  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Hanya SUPER_ADMIN yang dapat mengelola role" } },
      { status: 403 }
    );
  }
  // SUPER_ADMIN always passes (rbac.manage seeded, but be safe)
  if (user.role === "SUPER_ADMIN") return null;
  const canManage = await hasPermissionDb(user.id, "rbac.manage");
  if (!canManage) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengelola role" } },
      { status: 403 }
    );
  }
  return null;
}

// PATCH — replace all role permissions
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
    const gateErr = await ensureCanManageRoles(user);
    if (gateErr) return gateErr;

    const { id } = await params;
    const body = await req.json();
    const { permissionKeys } = body || {};

    if (!Array.isArray(permissionKeys)) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: permissionKeys (array)" } },
        { status: 400 }
      );
    }

    // Verify role exists
    const role = await db.role.findUnique({ where: { id } });
    if (!role) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Role tidak ditemukan" } },
        { status: 404 }
      );
    }

    // Use the lib helper — it enforces SUPER_ADMIN role protection (cannot remove any permission)
    const result = await updateRolePermissions(id, permissionKeys, user.id);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: result.error || "Gagal memperbarui permission role" } },
        { status: 400 }
      );
    }

    // Re-fetch updated role with permission keys
    const updated = await db.role.findUnique({
      where: { id },
      include: {
        rolePermissions: { include: { permission: { select: { key: true } } } },
        _count: { select: { users: true } },
      },
    });
    const shaped = updated
      ? {
          id: updated.id,
          key: updated.key,
          name: updated.name,
          description: updated.description,
          isSystem: updated.isSystem,
          color: updated.color,
          permissionKeys: updated.rolePermissions.map((rp) => rp.permission.key),
          userCount: updated._count.users,
        }
      : null;

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "ROLE_PERMISSIONS_UPDATE",
      resourceType: "Role",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        roleKey: role.key,
        roleName: role.name,
        permissionKeys,
        isSystem: role.isSystem,
      },
    });

    return NextResponse.json({ success: true, data: serialize(shaped) });
  } catch (e: any) {
    console.error("RBAC role permissions update error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// DELETE — delete role (only non-system roles; reject if users still assigned)
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
    const gateErr = await ensureCanManageRoles(user);
    if (gateErr) return gateErr;

    const { id } = await params;
    const role = await db.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Role tidak ditemukan" } },
        { status: 404 }
      );
    }

    // System roles cannot be deleted
    if (role.isSystem) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Role sistem tidak dapat dihapus" } },
        { status: 400 }
      );
    }

    // If users still assigned → reject
    if (role._count.users > 0) {
      return NextResponse.json(
        { success: false, error: { code: "ROLE_IN_USE", message: `Role masih digunakan oleh ${role._count.users} user` } },
        { status: 400 }
      );
    }

    // Cascade-delete RolePermission rows, then the role
    await db.$transaction([
      db.rolePermission.deleteMany({ where: { roleId: id } }),
      db.role.delete({ where: { id } }),
    ]);

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "ROLE_DELETE",
      resourceType: "Role",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        roleKey: role.key,
        roleName: role.name,
      },
    });

    return NextResponse.json({
      success: true,
      data: serialize({ id, deleted: true }),
    });
  } catch (e: any) {
    console.error("RBAC role delete error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
