// MVMP — Customers list
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { resolveTenantScope, customerScopeWhere } from "@/lib/tenant-scope";
import bcrypt from "bcryptjs";
import { provisionPackageForCustomer, serializeProvisionResult } from "@/lib/provisioner";

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role, "customers.view")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat customer" } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim();
    const resellerId = searchParams.get("resellerId")?.trim();

    const where: any = {};
    // Default: hide soft-deleted customers unless explicitly requested via status filter
    if (status) {
      where.status = status;
    } else {
      where.status = { not: "DELETED" };
    }
    if (resellerId) where.resellerId = resellerId;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { customerCode: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    // Tenant boundary: resellers only see their own subtree, customers only themselves.
    const scope = await resolveTenantScope(user);
    if (scope.kind === "none") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Profil tenant tidak ditemukan" } },
        { status: 403 }
      );
    }
    const scopeWhere = customerScopeWhere(scope);
    if (Object.keys(scopeWhere).length > 0) {
      where.AND = [...(where.AND || []), scopeWhere];
    }

    const [total, items] = await Promise.all([
      db.customer.count({ where }),
      db.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, email: true, phone: true, lastLoginAt: true, status: true } },
          reseller: { select: { id: true, resellerCode: true, user: { select: { name: true, email: true } } } },
          _count: { select: { vpnAccounts: true, transactions: true } },
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
    console.error("Customers list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// POST — admin creates a new customer (with portal login account)
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role, "customers.manage")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengelola customer" } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, email, phone, password, resellerId, packageId, serverId } = body || {};

    if (!name || !email || !password) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: name, email, password" } },
        { status: 400 }
      );
    }
    if (String(password).length < 8) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Password minimal 8 karakter" } },
        { status: 400 }
      );
    }

    // If packageId provided, serverId is also required (for auto-provisioning)
    if (packageId && !serverId) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib saat assign paket: serverId" } },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: "EMAIL_TAKEN", message: "Email sudah terdaftar" } },
        { status: 400 }
      );
    }

    // Optional reseller assignment
    let validResellerId: string | null = null;
    if (resellerId) {
      const res = await db.reseller.findUnique({ where: { id: resellerId } });
      if (!res) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "Reseller tidak ditemukan" } },
          { status: 400 }
        );
      }
      validResellerId = res.id;
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const newUser = await db.user.create({
      data: {
        email: normalizedEmail,
        username: normalizedEmail.split("@")[0] + "_" + Math.random().toString(36).slice(2, 8),
        name,
        passwordHash,
        role: "CUSTOMER",
        status: "ACTIVE",
        phone: phone || null,
        emailVerifiedAt: new Date(),
      },
    });

    // Generate unique customerCode (count-based with fallback)
    const custCount = await db.customer.count();
    let customerCode = `CUST-${String(custCount + 1).padStart(4, "0")}`;
    if (await db.customer.findUnique({ where: { customerCode } })) {
      customerCode = `CUST-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    }

    const newCustomer = await db.customer.create({
      data: {
        userId: newUser.id,
        resellerId: validResellerId,
        customerCode,
        name,
        email: normalizedEmail,
        phone: phone || null,
        status: "ACTIVE",
      },
      include: {
        user: { select: { id: true, email: true, phone: true, lastLoginAt: true, status: true } },
        reseller: { select: { id: true, resellerCode: true, user: { select: { name: true, email: true } } } },
        _count: { select: { vpnAccounts: true, transactions: true } },
      },
    });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "CREATE_CUSTOMER",
      resourceType: "Customer",
      resourceId: newCustomer.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: { customerEmail: normalizedEmail, customerCode, packageId: packageId || null, serverId: serverId || null },
    });

    // If a packageId + serverId was provided, auto-provision VPN accounts immediately
    // (admin assigning a package to a new customer — no payment flow needed).
    let provisionResult: ReturnType<typeof serializeProvisionResult> | null = null;
    if (packageId && serverId) {
      try {
        const result = await provisionPackageForCustomer(
          newCustomer.id,
          packageId,
          serverId,
          {
            actorUserId: user.id,
            actorType: user.role,
            ipAddress: ip,
            userAgent: ua,
          }
        );
        provisionResult = serializeProvisionResult(result);
      } catch (provErr: any) {
        // Provisioning failure should NOT roll back customer creation.
        // Customer is created; admin can retry provisioning separately.
        console.error("Auto-provision on customer create failed:", provErr?.message);
        provisionResult = {
          error: provErr?.message || "Provisioning gagal",
        } as any;
      }
    }

    return NextResponse.json(
      { success: true, data: serialize({ ...newCustomer, provisioned: provisionResult }) },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("Customer create error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
