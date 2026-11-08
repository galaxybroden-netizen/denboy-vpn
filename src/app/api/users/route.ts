// MVMP — Users list & create (SUPER_ADMIN only)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { hasPermissionDb } from "@/lib/rbac";
import bcrypt from "bcryptjs";

// Valid UserRole enum values (must match Prisma schema)
// Roles that can be managed via Settings → User Management — internal staff only.
// CUSTOMER and RESELLER are excluded:
//   - CUSTOMER is created via the "Pelanggan" menu (/api/customers)
//   - RESELLER is created via the "Reseller" menu (/api/resellers)
// Both have their own dedicated records (customerCode/resellerCode, etc.)
// and should not be mixed into the internal staff management page.
const STAFF_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "OPERATOR",
  "FINANCE",
  "CUSTOMER_SERVICE",
] as const;
// Full enum list (for validation only) — includes RESELLER + CUSTOMER for backwards compat
const VALID_ROLES = [...STAFF_ROLES, "RESELLER", "CUSTOMER"] as const;

// Read password min length from SystemSetting (fallback 8)
async function getPasswordMinLength(): Promise<number> {
  try {
    const row = await db.systemSetting.findUnique({ where: { key: "security.password_min_length" } });
    if (!row) return 8;
    const parsed = JSON.parse(row.value);
    return typeof parsed === "number" && parsed >= 6 ? parsed : 8;
  } catch {
    return 8;
  }
}

// GET — list users with pagination + filters
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }

    // SUPER_ADMIN protection: only SUPER_ADMIN with users.view can list users
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Hanya SUPER_ADMIN yang dapat mengelola pengguna" } },
        { status: 403 }
      );
    }
    const canView = await hasPermissionDb(user.id, "users.view");
    if (!canView) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat pengguna" } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const search = searchParams.get("search")?.trim() || "";
    const role = searchParams.get("role")?.trim();
    const status = searchParams.get("status")?.trim();

    const where: any = {};
    // Default: hide DELETED users unless explicitly requested
    if (status) {
      where.status = status;
    } else {
      where.status = { not: "DELETED" };
    }
    // Exclude CUSTOMER + RESELLER — they are managed via their own dedicated menus
    // ("Pelanggan" and "Reseller" respectively), not via Settings → User Management.
    if (role && STAFF_ROLES.includes(role as any)) {
      where.role = role;
    } else if (role === "CUSTOMER" || role === "RESELLER") {
      // Explicit API request for these roles — allow but UI won't send this
      where.role = role;
    } else {
      // No role filter → exclude both CUSTOMER and RESELLER by default
      where.role = { notIn: ["CUSTOMER", "RESELLER"] };
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { username: { contains: search } },
      ];
    }

    const [total, items] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        // Exclude sensitive fields from the response
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
          _count: { select: { sessions: true, auditLogs: true } },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: serialize({
        items,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      }),
    });
  } catch (e: any) {
    console.error("Users list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// POST — create new user (SUPER_ADMIN only)
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
        { success: false, error: { code: "FORBIDDEN", message: "Hanya SUPER_ADMIN yang dapat mengelola pengguna" } },
        { status: 403 }
      );
    }
    const canManage = await hasPermissionDb(user.id, "users.manage");
    if (!canManage) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengelola pengguna" } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { username, email, name, phone, password, role, status, expiresAt } = body || {};

    if (!username || !email || !name || !password || !role) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: username, email, name, password, role" } },
        { status: 400 }
      );
    }

    // Validate role — only internal STAFF roles can be created via User Management.
    // CUSTOMER must be created via "Pelanggan" menu (/api/customers).
    // RESELLER must be created via "Reseller" menu (/api/resellers).
    if (!STAFF_ROLES.includes(role as any)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "ROLE_NOT_ALLOWED",
            message: `Role "${role}" tidak dapat dibuat via Manajemen Pengguna. Gunakan menu "Pelanggan" untuk customer atau "Reseller" untuk reseller.`,
          },
        },
        { status: 400 }
      );
    }

    // Password length check (configurable via SystemSetting)
    const minLen = await getPasswordMinLength();
    if (String(password).length < minLen) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: `Password minimal ${minLen} karakter` } },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const normalizedUsername = String(username).trim();

    // Uniqueness checks
    const [emailTaken, usernameTaken] = await Promise.all([
      db.user.findUnique({ where: { email: normalizedEmail } }),
      db.user.findUnique({ where: { username: normalizedUsername } }),
    ]);
    if (emailTaken) {
      return NextResponse.json(
        { success: false, error: { code: "EMAIL_TAKEN", message: "Email sudah terdaftar" } },
        { status: 400 }
      );
    }
    if (usernameTaken) {
      return NextResponse.json(
        { success: false, error: { code: "USERNAME_TAKEN", message: "Username sudah digunakan" } },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const now = new Date();
    const userStatus = status || "ACTIVE";

    // Create user first
    const newUser = await db.user.create({
      data: {
        email: normalizedEmail,
        username: normalizedUsername,
        name,
        phone: phone || null,
        passwordHash,
        role,
        status: userStatus,
        lastPasswordChangeAt: now,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
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
        _count: { select: { sessions: true, auditLogs: true } },
      },
    });

    // If role is RESELLER, create Reseller record with defaults
    if (role === "RESELLER") {
      const resCount = await db.reseller.count();
      let resellerCode = `RES-${String(resCount + 1).padStart(4, "0")}`;
      if (await db.reseller.findUnique({ where: { resellerCode } })) {
        resellerCode = `RES-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      }
      await db.reseller.create({
        data: {
          userId: newUser.id,
          resellerCode,
          status: "ACTIVE",
          commissionRate: 10,
          accountLimit: 50,
          balance: 0,
        },
      });
    }

    // If role is CUSTOMER, create Customer record with auto-generated customerCode
    if (role === "CUSTOMER") {
      const custCount = await db.customer.count();
      let customerCode = `CUST-${String(custCount + 1).padStart(4, "0")}`;
      if (await db.customer.findUnique({ where: { customerCode } })) {
        customerCode = `CUST-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      }
      await db.customer.create({
        data: {
          userId: newUser.id,
          customerCode,
          name,
          email: normalizedEmail,
          phone: phone || null,
          status: "ACTIVE",
        },
      });
    }

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "USER_CREATE",
      resourceType: "User",
      resourceId: newUser.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        username: normalizedUsername,
        email: normalizedEmail,
        role,
        status: userStatus,
        expiresAt: expiresAt || null,
      },
    });

    return NextResponse.json(
      { success: true, data: serialize(newUser) },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("User create error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
