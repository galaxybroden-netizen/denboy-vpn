// MVMP — Webhook receiver for payment gateway callbacks
// Each provider sends payment status updates to this endpoint.
//
// Security model:
//   1. Signature is verified against the provider secret stored in
//      `payment.providers`. Unconfigured providers reject every callback.
//   2. The callback amount and currency must match the stored payment.
//   3. Only PENDING payments may transition; PAID callbacks are idempotent.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/auth";
import { isPaymentProvider, verifyProviderSignature } from "@/lib/payment-webhook";

const SETTING_KEY = "payment.providers";

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

// POST /api/payments/webhook/[provider]
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params;

    if (!isPaymentProvider(provider)) {
      return fail("INVALID_PROVIDER", "Provider tidak dikenal", 400);
    }

    const rawBody = await req.text();
    let body: any;
    try {
      body = JSON.parse(rawBody || "{}");
    } catch {
      return fail("INVALID_BODY", "Body bukan JSON yang valid", 400);
    }

    const setting = await db.systemSetting.findUnique({ where: { key: SETTING_KEY } });
    if (!setting) {
      return fail("NOT_CONFIGURED", "Payment provider belum dikonfigurasi", 503);
    }

    let config: any;
    try {
      config = JSON.parse(setting.value);
    } catch {
      return fail("CONFIG_ERROR", "Konfigurasi payment provider rusak", 503);
    }

    const verdict = verifyProviderSignature({
      provider,
      rawBody,
      body,
      headers: req.headers,
      config,
    });

    if (!verdict.ok) {
      const status = verdict.reason === "PROVIDER_NOT_CONFIGURED" ? 503 : 401;
      console.warn(`[webhook] rejected ${provider} callback: ${verdict.reason}`);
      return fail(
        verdict.reason || "INVALID_SIGNATURE",
        verdict.reason === "PROVIDER_NOT_CONFIGURED"
          ? "Webhook secret belum dikonfigurasi untuk provider ini"
          : "Signature tidak valid",
        status
      );
    }

    // Extract payment reference + status + amount (provider-specific shapes).
    let externalId = "";
    let paymentStatus = "";
    let amount = 0;
    let currency: string | null = null;

    switch (provider) {
      case "xendit":
        externalId = body.external_id || body.payment_id || "";
        paymentStatus =
          body.status === "SUCCEEDED" || body.status === "PAID" ? "PAID" : body.status;
        amount = Number(body.amount || 0);
        currency = body.currency || null;
        break;
      case "midtrans":
        externalId = body.order_id || "";
        paymentStatus =
          body.transaction_status === "settlement" || body.transaction_status === "capture"
            ? "PAID"
            : String(body.transaction_status || "").toUpperCase();
        amount = Number(body.gross_amount || 0);
        currency = body.currency || null;
        break;
      case "doku":
        externalId = body.order?.invoice_number || body.invoice_number || "";
        paymentStatus = body.transaction?.status === "SUCCESS" ? "PAID" : body.transaction?.status;
        amount = Number(body.order?.amount || body.amount || 0);
        currency = body.order?.currency || body.currency || null;
        break;
      case "ipaymu":
        externalId = body.referenceId || body.trx_id || "";
        paymentStatus = body.status === "berhasil" || body.status === "paid" ? "PAID" : body.status;
        amount = Number(body.total || 0);
        currency = body.currency || null;
        break;
    }

    if (!externalId) {
      return fail("MISSING_REF", "Payment reference tidak ditemukan", 400);
    }

    const payment = await db.payment.findFirst({
      where: { providerReference: externalId },
      include: { transaction: true },
    });

    if (!payment) {
      return fail("NOT_FOUND", "Payment tidak ditemukan", 404);
    }

    if (payment.provider.toUpperCase() !== provider.toUpperCase()) {
      console.warn(`[webhook] provider mismatch for ${externalId}`);
      return fail("PROVIDER_MISMATCH", "Provider tidak cocok dengan payment", 400);
    }

    // Amount and currency are part of the contract — never trust status alone.
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount) !== Math.round(payment.amount)) {
      console.warn(
        `[webhook] amount mismatch for ${externalId}: callback=${amount} stored=${payment.amount}`
      );
      return fail("AMOUNT_MISMATCH", "Nominal callback tidak sesuai dengan tagihan", 400);
    }

    if (currency && payment.currency && currency.toUpperCase() !== payment.currency.toUpperCase()) {
      return fail("CURRENCY_MISMATCH", "Mata uang callback tidak sesuai", 400);
    }

    const now = new Date();

    // Idempotent replay: already paid is a success, not a new transition.
    if (payment.status === "PAID") {
      return NextResponse.json({
        success: true,
        data: { processed: true, alreadyProcessed: true, status: "PAID" },
      });
    }

    if (paymentStatus === "PAID") {
      if (payment.status !== "PENDING") {
        return NextResponse.json({
          success: true,
          data: { processed: false, ignored: true, status: payment.status },
        });
      }

      await db.$transaction([
        db.payment.update({ where: { id: payment.id }, data: { status: "PAID", paidAt: now } }),
        db.transaction.updateMany({
          where: { id: payment.transactionId, status: { not: "PAID" } },
          data: { status: "PAID", paidAt: now },
        }),
      ]);

      await auditLog({
        actorType: "SYSTEM",
        action: "PAYMENT_WEBHOOK_PAID",
        resourceType: "Payment",
        resourceId: payment.id,
        metadata: {
          provider,
          providerReference: externalId,
          amount,
          currency: payment.currency,
          transactionId: payment.transactionId,
          invoiceNumber: payment.transaction?.invoiceNumber,
        },
      });

      return NextResponse.json({ success: true, data: { processed: true, status: "PAID" } });
    }

    if (paymentStatus === "EXPIRED" || paymentStatus === "FAILED") {
      if (payment.status !== "PENDING") {
        return NextResponse.json({
          success: true,
          data: { processed: false, ignored: true, status: payment.status },
        });
      }

      await db.$transaction([
        db.payment.update({
          where: { id: payment.id },
          data: { status: paymentStatus as any },
        }),
        db.transaction.updateMany({
          where: { id: payment.transactionId, status: "PENDING" },
          data: { status: paymentStatus === "EXPIRED" ? "EXPIRED" : "FAILED" },
        }),
      ]);

      return NextResponse.json({
        success: true,
        data: { processed: true, status: paymentStatus },
      });
    }

    // Unknown status: acknowledge without mutating so the provider does not retry.
    return NextResponse.json({
      success: true,
      data: { processed: false, ignored: true, status: paymentStatus || "UNKNOWN" },
    });
  } catch (e: any) {
    console.error("Webhook error:", e?.message);
    return fail("INTERNAL", "Terjadi kesalahan server", 500);
  }
}
