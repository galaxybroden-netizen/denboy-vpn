// MVMP — Payout / Disbursement request
// Sends money from merchant account to a destination bank/e-wallet.
// Supports Xendit Disbursement, Midtrans Payout, DOKU Payout, iPaymu Payout.
// In production: real API call to provider's disbursement endpoint.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { v4 as uuidv4 } from "uuid";

const SETTING_KEY = "payment.providers";

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } }, { status: 401 });
    if (!hasPermission(user.role as any, "payments.verify" as any)) return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin payout" } }, { status: 403 });

    const body = await req.json();
    const { provider, amount, currency, destinationBank, destinationAccount, destinationName, reference, notes } = body || {};

    if (!provider || !amount || !destinationBank || !destinationAccount || !destinationName) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: provider, amount, destinationBank, destinationAccount, destinationName" } }, { status: 400 });
    }

    // Fetch provider config
    const row = await db.systemSetting.findUnique({ where: { key: SETTING_KEY } });
    if (!row) return NextResponse.json({ success: false, error: { code: "NOT_CONFIGURED", message: "Payment provider belum dikonfigurasi" } }, { status: 400 });
    let config: any;
    try { config = JSON.parse(row.value); } catch { return NextResponse.json({ success: false, error: { code: "CONFIG_ERROR" } }, { status: 500 }); }
    const providerConfig = config[provider];
    if (!providerConfig?.enabled) return NextResponse.json({ success: false, error: { code: "PROVIDER_DISABLED", message: `${provider} tidak aktif` } }, { status: 400 });

    // Check payout support
    const payoutKey = provider === "xendit" ? "payoutEnabled" : "enabled";
    if (provider === "xendit" && !providerConfig.payoutEnabled) {
      return NextResponse.json({ success: false, error: { code: "PAYOUT_DISABLED", message: "Payout Xendit tidak diaktifkan" } }, { status: 400 });
    }

    // Generate payout reference
    const payoutRef = `PAYOUT-${provider.toUpperCase()}-${uuidv4().slice(0, 8)}`;

    // === In production: call provider's disbursement API ===
    // Xendit: POST https://api.xendit.co/disbursements
    // Midtrans: POST https://api.sandbox.midtrans.com/v2/payouts
    // DOKU: POST https://api-sandbox.doku.com/disbursement/v1.0/disbursement
    // iPaymu: POST https://my.ipaymu.com/api/v2/transfer
    //
    // Sandbox: return mock success
    await new Promise((r) => setTimeout(r, 500));

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "PAYOUT_REQUEST",
      resourceType: "Payment",
      resourceId: payoutRef,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        provider,
        amount,
        currency: currency || "IDR",
        destinationBank,
        destinationAccount: destinationAccount.slice(0, 4) + "****",
        destinationName,
        reference,
        notes,
        payoutRef,
      },
    });

    return NextResponse.json({
      success: true,
      data: serialize({
        payoutReference: payoutRef,
        provider,
        status: "COMPLETED", // sandbox: instant completion. Production: PENDING → COMPLETED/FAILED
        amount,
        currency: currency || "IDR",
        destination: { bank: destinationBank, account: destinationAccount, name: destinationName },
        reference,
        completedAt: new Date().toISOString(),
        message: `Payout ${amount} ${currency || "IDR"} via ${provider.toUpperCase()} ke ${destinationBank} (${destinationName}) berhasil diproses.`,
      }),
    });
  } catch (e: any) {
    console.error("Payout error:", e?.message);
    return NextResponse.json({ success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } }, { status: 500 });
  }
}
