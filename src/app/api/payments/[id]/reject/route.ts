// MVMP — Reject manual payment
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { broadcast, REALTIME_EVENTS } from "@/lib/realtime";

export async function POST(
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
    if (!hasPermission(user.role, "payments.verify")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin memverifikasi pembayaran" } },
        { status: 403 }
      );
    }

    const { id } = await params;

    let reason: string | undefined;
    try {
      const body = await req.json();
      reason = body?.reason;
    } catch {
      // body optional
    }

    const payment = await db.payment.findUnique({
      where: { id },
      include: { transaction: true },
    });
    if (!payment) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Pembayaran tidak ditemukan" } },
        { status: 404 }
      );
    }

    const updatedPayment = await db.payment.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: { transaction: true },
    });

    const updatedTx = await db.transaction.update({
      where: { id: payment.transactionId },
      data: { status: "CANCELLED" },
    });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "PAYMENT_REJECT",
      resourceType: "Payment",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        paymentId: id,
        transactionId: payment.transactionId,
        invoiceNumber: payment.transaction.invoiceNumber,
        reason: reason || null,
      },
    });

    await broadcast(REALTIME_EVENTS.PAYMENT_UPDATE, {
      action: "REJECTED",
      paymentId: id,
      transactionId: payment.transactionId,
      invoiceNumber: payment.transaction.invoiceNumber,
    });

    return NextResponse.json({
      success: true,
      data: serialize({ payment: updatedPayment, transaction: updatedTx }),
    });
  } catch (e: any) {
    console.error("Payment reject error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
