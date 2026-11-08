// MVMP — Customer detail
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { resolveTenantScope, canAccessCustomer } from "@/lib/tenant-scope";

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
    if (!hasPermission(user.role, "customers.view")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat customer" } },
        { status: 403 }
      );
    }

    const { id } = await params;

    const customer = await db.customer.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, phone: true, lastLoginAt: true, status: true, role: true } },
        reseller: {
          select: { id: true, resellerCode: true, user: { select: { name: true, email: true } } },
        },
        subscriptions: {
          orderBy: { createdAt: "desc" },
          include: { package: true },
        },
      },
    });

    if (!customer) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Customer tidak ditemukan" } },
        { status: 404 }
      );
    }

    // Tenant boundary — return 404 (not 403) so IDs cannot be enumerated.
    const scope = await resolveTenantScope(user);
    if (!canAccessCustomer(scope, customer)) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Customer tidak ditemukan" } },
        { status: 404 }
      );
    }

    // Recent 5 VPN accounts
    const vpnAccounts = await db.vpnAccount.findMany({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        server: { select: { id: true, name: true, publicIp: true, region: true } },
        protocol: { select: { id: true, displayName: true, engine: true } },
      },
    });

    // Recent 5 transactions
    const transactions = await db.transaction.findMany({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        payments: { select: { id: true, provider: true, status: true, amount: true, paidAt: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: serialize({
        ...customer,
        vpnAccounts,
        transactions,
      }),
    });
  } catch (e: any) {
    console.error("Customer detail error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// PATCH — admin updates customer profile / status
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
    if (!hasPermission(user.role, "customers.manage")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengelola customer" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const { name, email, phone, status, resellerId } = body || {};

    const customer = await db.customer.findUnique({ where: { id }, include: { user: true } });
    if (!customer) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Customer tidak ditemukan" } },
        { status: 404 }
      );
    }

    const VALID_STATUS = ["ACTIVE", "SUSPENDED", "INVITED", "DELETED"];
    if (status && !VALID_STATUS.includes(status)) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: `Status harus salah satu dari: ${VALID_STATUS.join(", ")}` } },
        { status: 400 }
      );
    }

    // If email changes, ensure it's not taken by another user
    let normalizedEmail: string | undefined;
    if (email) {
      normalizedEmail = String(email).toLowerCase().trim();
      const taken = await db.user.findFirst({
        where: { email: normalizedEmail, id: { not: customer.userId } },
      });
      if (taken) {
        return NextResponse.json(
          { success: false, error: { code: "EMAIL_TAKEN", message: "Email sudah digunakan user lain" } },
          { status: 400 }
        );
      }
    }

    let validResellerId: string | null | undefined;
    if (resellerId !== undefined) {
      if (resellerId === null || resellerId === "") {
        validResellerId = null;
      } else {
        const res = await db.reseller.findUnique({ where: { id: resellerId } });
        if (!res) {
          return NextResponse.json(
            { success: false, error: { code: "VALIDATION_ERROR", message: "Reseller tidak ditemukan" } },
            { status: 400 }
          );
        }
        validResellerId = res.id;
      }
    }

    const [updated] = await db.$transaction([
      db.customer.update({
        where: { id },
        data: {
          name: name ?? undefined,
          email: normalizedEmail ?? undefined,
          phone: phone !== undefined ? phone : undefined,
          status: status ?? undefined,
          resellerId: validResellerId !== undefined ? validResellerId : undefined,
        },
      }),
      db.user.update({
        where: { id: customer.userId },
        data: {
          name: name ?? undefined,
          email: normalizedEmail ?? undefined,
          phone: phone !== undefined ? phone : undefined,
          status: status && ["ACTIVE", "SUSPENDED", "INVITED", "DELETED"].includes(status) ? (status as any) : undefined,
        },
      }),
    ]);

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "UPDATE_CUSTOMER",
      resourceType: "Customer",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: { changes: { name, email: normalizedEmail, phone, status, resellerId } },
    });

    return NextResponse.json({ success: true, data: serialize(updated) });
  } catch (e: any) {
    console.error("Customer update error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// DELETE — soft-delete customer (status DELETED, login disabled, data preserved)
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
    if (!hasPermission(user.role, "customers.manage")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengelola customer" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const customer = await db.customer.findUnique({ where: { id }, include: { user: true } });
    if (!customer) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Customer tidak ditemukan" } },
        { status: 404 }
      );
    }

    await db.$transaction([
      db.customer.update({ where: { id }, data: { status: "DELETED" } }),
      db.user.update({ where: { id: customer.userId }, data: { status: "DELETED" } }),
    ]);

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "DELETE_CUSTOMER",
      resourceType: "Customer",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: { customerCode: customer.customerCode, softDelete: true },
    });

    return NextResponse.json({ success: true, data: { id, status: "DELETED" } });
  } catch (e: any) {
    console.error("Customer delete error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
