// MVMP — Transaction detail
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { resolveTenantScope, canAccessTransaction } from "@/lib/tenant-scope";

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
    if (!hasPermission(user.role, "transactions.view")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat transaksi" } },
        { status: 403 }
      );
    }

    const { id } = await params;

    const tx = await db.transaction.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            customerCode: true,
            phone: true,
            resellerId: true,
          },
        },
        reseller: {
          select: { id: true, resellerCode: true, user: { select: { name: true, email: true } } },
        },
        payments: {
          include: { manualProofs: true },
        },
        invoice: true,
        commissions: {
          include: {
            reseller: {
              select: { id: true, resellerCode: true, user: { select: { name: true } } },
            },
          },
        },
      },
    });

    if (!tx) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Transaksi tidak ditemukan" } },
        { status: 404 }
      );
    }

    // Tenant boundary — return 404 so other tenants' IDs stay unenumerable.
    const scope = await resolveTenantScope(user);
    if (!canAccessTransaction(scope, tx)) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Transaksi tidak ditemukan" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: serialize(tx) });
  } catch (e: any) {
    console.error("Transaction detail error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// PATCH — admin updates transaction (currently: cancel PENDING)
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
    if (!hasPermission(user.role, "transactions.manage")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengubah transaksi" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const action = body?.action as string;

    if (action !== "cancel") {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Action hanya mendukung: cancel" } },
        { status: 400 }
      );
    }

    const tx = await db.transaction.findUnique({ where: { id } });
    if (!tx) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Transaksi tidak ditemukan" } },
        { status: 404 }
      );
    }
    if (tx.status !== "PENDING") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_STATUS", message: `Hanya transaksi PENDING yang bisa dibatalkan (status saat ini: ${tx.status})` } },
        { status: 409 }
      );
    }

    const updated = await db.transaction.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "CANCEL_TRANSACTION",
      resourceType: "Transaction",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: { invoiceNumber: tx.invoiceNumber, amount: tx.amount, currency: tx.currency },
    });

    return NextResponse.json({ success: true, data: serialize(updated) });
  } catch (e: any) {
    console.error("Transaction update error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
