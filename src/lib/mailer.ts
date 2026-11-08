// MVMP — Mock email service (Batch 3)
// In production this would call an SMTP provider (Resend/Mailgun/SES).
// For the MVP every email is persisted to the EmailLog table, logged to the
// console, and broadcast in realtime so the admin "Log Email" view updates live.

import { db } from "./db";
import { broadcast, REALTIME_EVENTS } from "./realtime";

export type EmailTemplate =
  | "WELCOME_ACCOUNT"
  | "PAYMENT_RECEIPT"
  | "EXPIRY_WARNING"
  | "GENERIC";

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  template: EmailTemplate;
  relatedType?: string;
  relatedId?: string;
}

export async function sendEmail(params: SendEmailParams) {
  try {
    const log = await db.emailLog.create({
      data: {
        toEmail: params.to,
        subject: params.subject,
        body: params.body,
        template: params.template,
        status: "SENT",
        relatedType: params.relatedType || null,
        relatedId: params.relatedId || null,
      },
    });

    console.log(`[EMAIL MOCK] to=${params.to} | "${params.subject}" (${params.template})`);

    broadcast(REALTIME_EVENTS.EMAIL_NEW, {
      id: log.id,
      toEmail: params.to,
      subject: params.subject,
      template: params.template,
      createdAt: log.createdAt,
    });

    return { ok: true as const, log };
  } catch (e: any) {
    console.error("[EMAIL MOCK] failed:", e?.message);
    return { ok: false as const, error: e?.message };
  }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function sendWelcomeAccountEmail(params: {
  to: string;
  customerName: string;
  username: string;
  protocolName: string;
  serverName: string;
  expiresAt?: Date | string | null;
  relatedAccountId?: string;
}) {
  const expires =
    params.expiresAt ? new Date(params.expiresAt).toLocaleDateString("id-ID") : "-";
  return sendEmail({
    to: params.to,
    subject: `Akun VPN Anda aktif — ${params.username}`,
    template: "WELCOME_ACCOUNT",
    relatedType: "VpnAccount",
    relatedId: params.relatedAccountId,
    body: [
      `Halo ${params.customerName},`,
      ``,
      `Akun VPN Anda telah berhasil dibuat dan aktif.`,
      ``,
      `  Server      : ${params.serverName}`,
      `  Protokol    : ${params.protocolName}`,
      `  Username    : ${params.username}`,
      `  Berlaku s/d : ${expires}`,
      ``,
      `Konfigurasi lengkap (config file & kredensial) dapat diunduh`,
      `melalui portal pelanggan MVMP.`,
      ``,
      `Terima kasih telah menggunakan layanan kami.`,
      `— Tim MVMP`,
    ].join("\n"),
  });
}

export async function sendPaymentReceiptEmail(params: {
  to: string;
  customerName: string;
  invoiceNumber: string;
  amountFormatted: string;
  packageName?: string;
  relatedTransactionId?: string;
}) {
  return sendEmail({
    to: params.to,
    subject: `Pembayaran diterima — Invoice ${params.invoiceNumber}`,
    template: "PAYMENT_RECEIPT",
    relatedType: "Transaction",
    relatedId: params.relatedTransactionId,
    body: [
      `Halo ${params.customerName},`,
      ``,
      `Pembayaran Anda telah kami terima dan diverifikasi.`,
      ``,
      `  No. Invoice : ${params.invoiceNumber}`,
      params.packageName ? `  Paket       : ${params.packageName}` : undefined,
      `  Jumlah      : ${params.amountFormatted}`,
      ``,
      `Invoice PDF dapat diunduh dari portal pelanggan.`,
      ``,
      `Terima kasih.`,
      `— Tim MVMP`,
    ]
      .filter((l) => l !== undefined)
      .join("\n"),
  });
}

export async function sendExpiryWarningEmail(params: {
  to: string;
  customerName: string;
  username: string;
  expiresAt: Date | string;
  relatedSubscriptionId?: string;
}) {
  const d = new Date(params.expiresAt).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return sendEmail({
    to: params.to,
    subject: `Penting: langganan VPN Anda segera berakhir (${d})`,
    template: "EXPIRY_WARNING",
    relatedType: "Subscription",
    relatedId: params.relatedSubscriptionId,
    body: [
      `Halo ${params.customerName},`,
      ``,
      `Langganan VPN Anda untuk akun "${params.username}" akan berakhir pada:`,
      ``,
      `  ${d}`,
      ``,
      `Perpanjang sekarang melalui portal pelanggan agar layanan`,
      `Anda tidak terputus.`,
      ``,
      `— Tim MVMP`,
    ].join("\n"),
  });
}
