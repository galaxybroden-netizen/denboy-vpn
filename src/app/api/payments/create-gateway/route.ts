// MVMP — Create gateway payment (customer pays via Xendit/Midtrans/DOKU/iPaymu)
// Creates a Payment record + calls provider's API to get payment URL/QR.
// In production: real API call to provider. Sandbox: returns mock redirect URL.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { resolveTenantScope, canAccessTransaction } from "@/lib/tenant-scope";
import { v4 as uuidv4 } from "uuid";

const SETTING_KEY = "payment.providers";

const PROVIDER_LABELS: Record<string, string> = {
  xendit: "Xendit",
  midtrans: "Midtrans",
  doku: "DOKU",
  ipaymu: "iPaymu",
};

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } }, { status: 401 });

    const body = await req.json();
    const { transactionId, provider } = body || {};

    if (!transactionId || !provider) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: transactionId, provider" } }, { status: 400 });
    }

    if (!PROVIDER_LABELS[provider]) {
      return NextResponse.json({ success: false, error: { code: "INVALID_PROVIDER", message: "Provider tidak valid" } }, { status: 400 });
    }

    // Fetch transaction
    const tx = await db.transaction.findUnique({
      where: { id: transactionId },
      include: { customer: true },
    });
    if (!tx) return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Transaksi tidak ditemukan" } }, { status: 404 });

    // Ownership: a customer may only request a gateway for their own transaction.
    const scope = await resolveTenantScope(user);
    if (!canAccessTransaction(scope, tx)) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Transaksi tidak ditemukan" } }, { status: 404 });
    }

    if (tx.status !== "PENDING") return NextResponse.json({ success: false, error: { code: "INVALID_STATUS", message: `Transaksi sudah ${tx.status}` } }, { status: 400 });

    // Fetch provider config
    const row = await db.systemSetting.findUnique({ where: { key: SETTING_KEY } });
    if (!row) return NextResponse.json({ success: false, error: { code: "NOT_CONFIGURED", message: "Payment provider belum dikonfigurasi" } }, { status: 400 });
    let config: any;
    try { config = JSON.parse(row.value); } catch { return NextResponse.json({ success: false, error: { code: "CONFIG_ERROR" } }, { status: 500 }); }
    const providerConfig = config[provider];
    if (!providerConfig?.enabled) return NextResponse.json({ success: false, error: { code: "PROVIDER_DISABLED", message: `${PROVIDER_LABELS[provider]} tidak aktif` } }, { status: 400 });

    // Generate external reference
    const externalRef = `MVMP-${tx.invoiceNumber}-${provider.toUpperCase()}-${uuidv4().slice(0, 8)}`;

    // Update existing payment or create new one
    const existingPayment = await db.payment.findFirst({ where: { transactionId: tx.id } });
    if (existingPayment) {
      await db.payment.update({
        where: { id: existingPayment.id },
        data: {
          provider: provider.toUpperCase(),
          providerReference: externalRef,
          paymentMethod: provider,
        },
      });
    }

    // === In production: call provider API ===
    // Xendit: POST https://api.xendit.co/payment_requests
    // Midtrans: POST https://app.sandbox.midtrans.com/snap/v1/transactions
    // DOKU: POST https://api-sandbox.doku.com/payment/v1.0/payment-page
    // iPaymu: POST https://my.ipaymu.com/api/v2/payment/direct
    //
    // Sandbox: return mock payment URL
    const mockPaymentUrl = `https://checkout.${provider}.sandbox.com/pay/${externalRef}`;

    return NextResponse.json({
      success: true,
      data: serialize({
        provider,
        providerLabel: PROVIDER_LABELS[provider],
        externalReference: externalRef,
        paymentUrl: mockPaymentUrl,
        amount: tx.amount,
        currency: tx.currency,
        invoiceNumber: tx.invoiceNumber,
        mode: providerConfig.mode,
        webhookUrl: `${req.nextUrl.origin}/api/payments/webhook/${provider}`,
        customerName: tx.customer?.name,
      }),
    });
  } catch (e: any) {
    console.error("Create gateway payment error:", e?.message);
    return NextResponse.json({ success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } }, { status: 500 });
  }
}
