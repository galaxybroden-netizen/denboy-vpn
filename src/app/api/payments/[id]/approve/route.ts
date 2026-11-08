// MVMP — Approve manual payment
// After marking payment & transaction as PAID, auto-provision N VPN accounts
// (one per protocol in the package) on the chosen server via the provisioner.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize, formatCurrencyRaw } from "@/lib/utils-mvmp";
import { broadcast, REALTIME_EVENTS } from "@/lib/realtime";
import { sendPaymentReceiptEmail } from "@/lib/mailer";
import { provisionPackageForCustomer, serializeProvisionResult } from "@/lib/provisioner";

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

    const payment = await db.payment.findUnique({
      where: { id },
      include: { transaction: { include: { customer: true, package: true } } },
    });
    if (!payment) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Pembayaran tidak ditemukan" } },
        { status: 404 }
      );
    }

    const now = new Date();

    const updatedPayment = await db.payment.update({
      where: { id },
      data: { status: "PAID", paidAt: now },
      include: { transaction: true },
    });

    const updatedTx = await db.transaction.update({
      where: { id: payment.transactionId },
      data: { status: "PAID", paidAt: now },
    });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "PAYMENT_APPROVE",
      resourceType: "Payment",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        paymentId: id,
        transactionId: payment.transactionId,
        invoiceNumber: payment.transaction.invoiceNumber,
        amount: payment.amount,
      },
    });

    // Realtime push + mock email receipt (Batch 3)
    await broadcast(REALTIME_EVENTS.PAYMENT_UPDATE, {
      action: "APPROVED",
      paymentId: id,
      transactionId: payment.transactionId,
      invoiceNumber: payment.transaction.invoiceNumber,
      amount: payment.amount,
      currency: payment.currency,
    });
    await sendPaymentReceiptEmail({
      to: payment.transaction.customer.email,
      customerName: payment.transaction.customer.name,
      invoiceNumber: payment.transaction.invoiceNumber,
      amountFormatted: formatCurrencyRaw(payment.amount, payment.currency),
      relatedTransactionId: payment.transactionId,
    });

    // ============================================================
    // Auto-provision VPN accounts (one per protocol in the package)
    // ============================================================
    // Skip if transaction has no package (e.g., old transactions before this feature)
    // or no server chosen (admin should pick a server in the admin UI before approving).
    let provisionResult: ReturnType<typeof serializeProvisionResult> | null = null;
    const tx = payment.transaction;
    if (tx.packageId && tx.serverId) {
      try {
        const result = await provisionPackageForCustomer(
          tx.customerId,
          tx.packageId,
          tx.serverId,
          {
            actorUserId: user.id,
            actorType: user.role,
            ipAddress: ip,
            userAgent: ua,
          }
        );
        provisionResult = serializeProvisionResult(result);

        // Broadcast provisioned accounts to admins (so VPN accounts list refreshes)
        await broadcast(REALTIME_EVENTS.ACCOUNT_UPDATE, {
          action: "BULK_CREATED",
          customerId: tx.customerId,
          packageName: result.packageName,
          totalCreated: result.totalCreated,
          totalSkipped: result.totalSkipped,
          serverName: result.serverName,
        });
      } catch (provErr: any) {
        // Provisioning failure should NOT roll back the payment approval.
        // Log it, return warning, but the payment is still PAID.
        console.error("Auto-provision failed (payment still approved):", provErr?.message);
        provisionResult = {
          error: provErr?.message || "Provisioning gagal",
        } as any;
      }
    }

    // ============================================================
    // Send WhatsApp notification (payment success + login link + credentials)
    // ============================================================
    // Best-effort: don't fail the approval if WhatsApp send fails.
    let whatsappResult: { success: boolean; messageId?: string; error?: string } | null = null;
    try {
      const { sendTemplatedMessageToCustomer } = await import("@/lib/whatsapp");
      const waRes = await sendTemplatedMessageToCustomer(tx.customerId, "payment_success", {
        invoice_number: tx.invoiceNumber,
        amount: formatCurrencyRaw(payment.amount, payment.currency),
        login_link: "https://mvmp.your-domain.com",
        // Credentials hint: customer should use the email + the password they chose at signup.
        // For admin-created customers, password is the one admin set — we don't have plaintext here.
        username: payment.transaction.customer.email,
        password: "(password yang Anda daftarkan)",
        expires_at: provisionResult?.expiresAt
          ? new Date(provisionResult.expiresAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
          : "",
      });
      whatsappResult = waRes;
    } catch (waErr: any) {
      console.error("WhatsApp send failed (non-fatal):", waErr?.message);
      whatsappResult = { success: false, error: waErr?.message };
    }

    return NextResponse.json({
      success: true,
      data: serialize({
        payment: updatedPayment,
        transaction: updatedTx,
        provisioned: provisionResult,
        whatsapp: whatsappResult,
      }),
    });
  } catch (e: any) {
    console.error("Payment approve error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
