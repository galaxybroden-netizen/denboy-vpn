// MVMP — User detail (GET / PATCH / DELETE) — SUPER_ADMIN only
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { hasPermissionDb } from "@/lib/rbac";

const VALID_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "OPERATOR",
  "FINANCE",
  "CUSTOMER_SERVICE",
  "RESELLER",
  "CUSTOMER",
] as const;

// Common SUPER_ADMIN gate for all methods on this route
async function ensureSuperAdmin(user: any): Promise<NextResponse | null> {
  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Hanya SUPER_ADMIN yang dapat mengelola pengguna" } },
      { status: 403 }
    );
  }
  const canView = await hasPermissionDb(user.id, "users.view");
  if (!canView) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengelola pengguna" } },
      { status: 403 }
    );
  }
  return null;
}

// GET — user detail
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
    const gateErr = await ensureSuperAdmin(user);
    if (gateErr) return gateErr;

    const { id } = await params;

    const target = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        phone: true,
        name: true,
        role: true,
        status: true,
        mfaEnabled: true,
        expiresAt: true,
        lastLoginAt: true,
        lastPasswordChangeAt: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        roleId: true,
        createdAt: true,
        updatedAt: true,
        roleRecord: { select: { id: true, key: true, name: true, color: true } },
        userPermissions: {
          include: {
            permission: { select: { id: true, key: true, name: true } },
          },
        },
        _count: { select: { sessions: true } },
      },
    });

    if (!target) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Pengguna tidak ditemukan" } },
        { status: 404 }
      );
    }

    // Shape userPermissions to expose `mode` at the top level (it's already there in schema)
    const shaped = {
      ...target,
      userPermissions: target.userPermissions.map((up) => ({
        id: up.id,
        mode: up.mode,
        permission: { id: up.permission.id, key: up.permission.key, name: up.permission.name },
      })),
    };

    return NextResponse.json({ success: true, data: serialize(shaped) });
  } catch (e: any) {
    console.error("User detail error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// PATCH — update user
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
    const gateErr = await ensureSuperAdmin(user);
    if (gateErr) return gateErr;

    const canManage = await hasPermissionDb(user.id, "users.manage");
    if (!canManage) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengelola pengguna" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const { name, email, phone, role, status, expiresAt } = body || {};

    const target = await db.user.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Pengguna tidak ditemukan" } },
        { status: 404 }
      );
    }

    // SUPER_ADMIN self-protection: cannot demote self from SUPER_ADMIN
    if (
      user.role === "SUPER_ADMIN" &&
      target.role === "SUPER_ADMIN" &&
      role &&
      role !== "SUPER_ADMIN" &&
      target.id === user.id
    ) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Tidak dapat menurunkan role SUPER_ADMIN sendiri" } },
        { status: 400 }
      );
    }

    // Last SUPER_ADMIN protection: cannot demote the only remaining SUPER_ADMIN
    if (role && role !== "SUPER_ADMIN" && target.role === "SUPER_ADMIN") {
      const superAdminCount = await db.user.count({ where: { role: "SUPER_ADMIN", status: { not: "DELETED" } } });
      if (superAdminCount <= 1) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "Tidak dapat menurunkan SUPER_ADMIN terakhir. Tambahkan SUPER_ADMIN lain terlebih dahulu." } },
          { status: 400 }
        );
      }
    }

    // Validate role enum if provided
    if (role && !VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: `Role tidak valid. Pilihan: ${VALID_ROLES.join(", ")}` } },
        { status: 400 }
      );
    }

    // Email uniqueness if changing
    let normalizedEmail: string | undefined;
    if (email !== undefined) {
      normalizedEmail = String(email).toLowerCase().trim();
      if (normalizedEmail !== target.email) {
        const taken = await db.user.findFirst({
          where: { email: normalizedEmail, id: { not: id } },
        });
        if (taken) {
          return NextResponse.json(
            { success: false, error: { code: "EMAIL_TAKEN", message: "Email sudah digunakan pengguna lain" } },
            { status: 400 }
          );
        }
      }
    }

    // Build update payload
    const data: any = {};
    const changed: string[] = [];
    if (name !== undefined && name !== target.name) { data.name = name; changed.push("name"); }
    if (normalizedEmail !== undefined && normalizedEmail !== target.email) { data.email = normalizedEmail; changed.push("email"); }
    if (phone !== undefined && phone !== target.phone) { data.phone = phone || null; changed.push("phone"); }
    if (role !== undefined && role !== target.role) { data.role = role; changed.push("role"); }
    if (status !== undefined && status !== target.status) { data.status = status; changed.push("status"); }
    if (expiresAt !== undefined) {
      const newExpires = expiresAt ? new Date(expiresAt) : null;
      if (String(newExpires) !== String(target.expiresAt)) {
        data.expiresAt = newExpires;
        changed.push("expiresAt");
      }
    }

    if (changed.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Tidak ada perubahan untuk diterapkan" } },
        { status: 400 }
      );
    }

    const updated = await db.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        username: true,
        phone: true,
        name: true,
        role: true,
        status: true,
        mfaEnabled: true,
        expiresAt: true,
        lastLoginAt: true,
        lastPasswordChangeAt: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        roleId: true,
        createdAt: true,
        updatedAt: true,
        roleRecord: { select: { id: true, key: true, name: true, color: true } },
        _count: { select: { sessions: true } },
      },
    });

    // If role changes to RESELLER/CUSTOMER and no existing record → create one
    const newRole = role ?? target.role;
    if (newRole === "RESELLER" && target.role !== "RESELLER") {
      const existingReseller = await db.reseller.findUnique({ where: { userId: id } });
      if (!existingReseller) {
        const resCount = await db.reseller.count();
        let resellerCode = `RES-${String(resCount + 1).padStart(4, "0")}`;
        if (await db.reseller.findUnique({ where: { resellerCode } })) {
          resellerCode = `RES-${Date.now().toString(36).toUpperCase().slice(-6)}`;
        }
        await db.reseller.create({
          data: {
            userId: id,
            resellerCode,
            status: "ACTIVE",
            commissionRate: 10,
            accountLimit: 50,
            balance: 0,
          },
        });
      }
    }
    // Block changing role TO CUSTOMER or RESELLER via User Management.
    // Both must be created via their own dedicated menus:
    //   - CUSTOMER → "Pelanggan" menu (/api/customers)
    //   - RESELLER → "Reseller" menu (/api/resellers)
    if ((role === "CUSTOMER" || role === "RESELLER") && target.role !== role) {
      const menuName = role === "CUSTOMER" ? "Pelanggan" : "Reseller";
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "ROLE_NOT_ALLOWED",
            message: `Tidak dapat mengubah role menjadi ${role} via Manajemen Pengguna. Gunakan menu '${menuName}' untuk membuat akun ${role.toLowerCase()} baru.`,
          },
        },
        { status: 400 }
      );
    }
    if (newRole === "CUSTOMER" && target.role !== "CUSTOMER") {
      const existingCustomer = await db.customer.findUnique({ where: { userId: id } });
      if (!existingCustomer) {
        const custCount = await db.customer.count();
        let customerCode = `CUST-${String(custCount + 1).padStart(4, "0")}`;
        if (await db.customer.findUnique({ where: { customerCode } })) {
          customerCode = `CUST-${Date.now().toString(36).toUpperCase().slice(-6)}`;
        }
        await db.customer.create({
          data: {
            userId: id,
            customerCode,
            name: name || target.name,
            email: normalizedEmail || target.email,
            phone: phone !== undefined ? phone || null : target.phone,
            status: "ACTIVE",
          },
        });
      }
    }

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "USER_UPDATE",
      resourceType: "User",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        changedFields: changed,
        before: {
          name: target.name,
          email: target.email,
          phone: target.phone,
          role: target.role,
          status: target.status,
          expiresAt: target.expiresAt,
        },
        after: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          role: data.role,
          status: data.status,
          expiresAt: data.expiresAt,
        },
      },
    });

    return NextResponse.json({ success: true, data: serialize(updated) });
  } catch (e: any) {
    console.error("User update error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// DELETE — soft-delete (deactivate) user
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
    const gateErr = await ensureSuperAdmin(user);
    if (gateErr) return gateErr;

    const canManage = await hasPermissionDb(user.id, "users.manage");
    if (!canManage) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengelola pengguna" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const target = await db.user.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Pengguna tidak ditemukan" } },
        { status: 404 }
      );
    }

    // Cannot deactivate self
    if (target.id === user.id) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Tidak dapat menonaktifkan akun sendiri" } },
        { status: 400 }
      );
    }

    // Cannot deactivate last SUPER_ADMIN (only count ACTIVE ones)
    if (target.role === "SUPER_ADMIN") {
      const activeSuperAdmins = await db.user.count({
        where: { role: "SUPER_ADMIN", status: "ACTIVE" },
      });
      if (activeSuperAdmins <= 1) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "Tidak dapat menonaktifkan SUPER_ADMIN aktif terakhir" } },
          { status: 400 }
        );
      }
    }

    await db.user.update({
      where: { id },
      data: { status: "INACTIVE" },
    });

    // Revoke all active sessions for this user
    await db.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "USER_DEACTIVATE",
      resourceType: "User",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        username: target.username,
        email: target.email,
        previousStatus: target.status,
        softDelete: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: serialize({ id, status: "INACTIVE" }),
    });
  } catch (e: any) {
    console.error("User deactivate error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
