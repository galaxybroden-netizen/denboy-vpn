// MVMP — Reseller detail
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

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
    if (!hasPermission(user.role, "resellers.view")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat reseller" } },
        { status: 403 }
      );
    }

    const { id } = await params;

    const reseller = await db.reseller.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, phone: true, name: true, status: true, lastLoginAt: true } },
        parentReseller: {
          select: { id: true, resellerCode: true, user: { select: { name: true, email: true } } },
        },
      },
    });

    if (!reseller) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Reseller tidak ditemukan" } },
        { status: 404 }
      );
    }

    const [ledger, commissions, customersCount] = await Promise.all([
      db.resellerLedger.findMany({
        where: { resellerId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      db.resellerCommission.findMany({
        where: { resellerId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { transaction: { select: { invoiceNumber: true, amount: true, status: true } } },
      }),
      db.customer.count({ where: { resellerId: id } }),
    ]);

    return NextResponse.json({
      success: true,
      data: serialize({
        ...reseller,
        ledger,
        commissions,
        customersCount,
      }),
    });
  } catch (e: any) {
    console.error("Reseller detail error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// PATCH — admin updates reseller settings / status
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
    if (!hasPermission(user.role, "resellers.manage")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengelola reseller" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const { name, email, phone, status, commissionRate, accountLimit, parentResellerId } = body || {};

    const reseller = await db.reseller.findUnique({ where: { id }, include: { user: true } });
    if (!reseller) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Reseller tidak ditemukan" } },
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

    let rate: number | undefined;
    if (commissionRate !== undefined) {
      rate = Number(commissionRate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "Komisi harus 0-100 (%)" } },
          { status: 400 }
        );
      }
    }
    let limit: number | undefined;
    if (accountLimit !== undefined) {
      limit = Number(accountLimit);
      if (!Number.isFinite(limit) || limit < 1) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "Limit akun minimal 1" } },
          { status: 400 }
        );
      }
    }

    let normalizedEmail: string | undefined;
    if (email) {
      normalizedEmail = String(email).toLowerCase().trim();
      const taken = await db.user.findFirst({
        where: { email: normalizedEmail, id: { not: reseller.userId } },
      });
      if (taken) {
        return NextResponse.json(
          { success: false, error: { code: "EMAIL_TAKEN", message: "Email sudah digunakan user lain" } },
          { status: 400 }
        );
      }
    }

    let validParentId: string | null | undefined;
    if (parentResellerId !== undefined) {
      if (parentResellerId === null || parentResellerId === "") {
        validParentId = null;
      } else if (parentResellerId === id) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "Reseller induk tidak boleh dirinya sendiri" } },
          { status: 400 }
        );
      } else {
        const parent = await db.reseller.findUnique({ where: { id: parentResellerId } });
        if (!parent) {
          return NextResponse.json(
            { success: false, error: { code: "VALIDATION_ERROR", message: "Reseller induk tidak ditemukan" } },
            { status: 400 }
          );
        }
        validParentId = parent.id;
      }
    }

    const [updated] = await db.$transaction([
      db.reseller.update({
        where: { id },
        data: {
          status: status ?? undefined,
          commissionRate: rate,
          accountLimit: limit,
          parentResellerId: validParentId !== undefined ? validParentId : undefined,
        },
      }),
      db.user.update({
        where: { id: reseller.userId },
        data: {
          name: name ?? undefined,
          email: normalizedEmail ?? undefined,
          phone: phone !== undefined ? phone : undefined,
          status: status && VALID_STATUS.includes(status) ? (status as any) : undefined,
        },
      }),
    ]);

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "UPDATE_RESELLER",
      resourceType: "Reseller",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: { changes: { name, email: normalizedEmail, status, commissionRate: rate, accountLimit: limit } },
    });

    return NextResponse.json({ success: true, data: serialize(updated) });
  } catch (e: any) {
    console.error("Reseller update error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// DELETE — soft-delete reseller (status DELETED, login disabled, ledger preserved)
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
    if (!hasPermission(user.role, "resellers.manage")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengelola reseller" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const reseller = await db.reseller.findUnique({
      where: { id },
      include: { user: true, _count: { select: { customers: true } } },
    });
    if (!reseller) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Reseller tidak ditemukan" } },
        { status: 404 }
      );
    }
    if (reseller._count.customers > 0) {
      return NextResponse.json(
        { success: false, error: { code: "HAS_CUSTOMERS", message: `Tidak dapat menghapus: reseller masih memiliki ${reseller._count.customers} pelanggan aktif` } },
        { status: 409 }
      );
    }

    await db.$transaction([
      db.reseller.update({ where: { id }, data: { status: "DELETED" } }),
      db.user.update({ where: { id: reseller.userId }, data: { status: "DELETED" } }),
    ]);

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "DELETE_RESELLER",
      resourceType: "Reseller",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: { resellerCode: reseller.resellerCode, softDelete: true },
    });

    return NextResponse.json({ success: true, data: { id, status: "DELETED" } });
  } catch (e: any) {
    console.error("Reseller delete error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
