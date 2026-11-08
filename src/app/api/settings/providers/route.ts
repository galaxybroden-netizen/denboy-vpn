// MVMP — Payment Providers settings (DB-backed via SystemSetting)
// Supports: Manual Bank Transfer, QRIS, Xendit, Midtrans, DOKU, iPaymu
// Each gateway provider has: enabled, mode (sandbox/production), credentials,
// callback URL, webhook secret, and supported payment methods.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

const SETTING_KEY = "payment.providers";

const DEFAULT_CONFIG = {
  manual: {
    enabled: true,
    banks: [
      { code: "BCA", name: "Bank Central Asia", accountNumber: "1234567890", accountHolder: "MVMP STORE" },
      { code: "MANDIRI", name: "Bank Mandiri", accountNumber: "0987654321", accountHolder: "MVMP STORE" },
      { code: "BNI", name: "Bank Negara Indonesia", accountNumber: "1122334455", accountHolder: "MVMP STORE" },
      { code: "BRI", name: "Bank Rakyat Indonesia", accountNumber: "5566778899", accountHolder: "MVMP STORE" },
    ],
  },
  qris: {
    enabled: true,
    merchantId: "MVMP-STORE",
    merchantName: "MVMP Store",
  },
  xendit: {
    enabled: false,
    mode: "sandbox",
    apiKey: "",
    webhookToken: "",
    // Xendit supports: EWALLET (OVO, DANA, LinkAja), VA (BCA, BNI, Mandiri, BRI, Permata),
    //                  QRIS, Credit Card, PayLater
    methods: ["EWALLET", "VA", "QRIS", "CARD"],
    callbackUrl: "",
    payoutEnabled: false,
    payoutApiKey: "",
  },
  midtrans: {
    enabled: false,
    mode: "sandbox",
    serverKey: "",
    clientKey: "",
    // Midtrans supports: bank_transfer (VA), e-wallet (Gopay, ShopeePay, OVO),
    //                     qris, credit_card, akulaku
    methods: ["bank_transfer", "gopay", "qris", "credit_card"],
    callbackUrl: "",
  },
  doku: {
    enabled: false,
    mode: "sandbox",
    clientId: "",
    sharedKey: "",
    // DOKU supports: VA (BCA, Mandiri, BNI, BRI, Permata), QRIS, Credit Card,
    //                 e-wallet (OVO, DANA, LinkAja), Direct Debit
    methods: ["VA", "QRIS", "CREDIT_CARD", "EWALLET"],
    callbackUrl: "",
  },
  ipaymu: {
    enabled: false,
    mode: "sandbox",
    apiKey: "",
    vaNumber: "",
    // iPaymu supports: VA, QRIS, Credit Card, e-wallet, convenience store (Alfamart, Indomaret)
    methods: ["VA", "QRIS", "CREDIT_CARD", "EWALLET", "CVS"],
    callbackUrl: "",
  },
};

async function getConfig() {
  const row = await db.systemSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) {
    // Seed default config
    await db.systemSetting.create({
      data: {
        key: SETTING_KEY,
        value: JSON.stringify(DEFAULT_CONFIG),
        category: "payment",
        isSensitive: false,
      },
    });
    return DEFAULT_CONFIG;
  }
  try {
    return JSON.parse(row.value);
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function saveConfig(config: any, userId: string, ip: string, ua: string) {
  await db.systemSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: JSON.stringify(config), updatedBy: userId },
    create: {
      key: SETTING_KEY,
      value: JSON.stringify(config),
      category: "payment",
      updatedBy: userId,
    },
  });
  await auditLog({
    actorUserId: userId,
    actorType: "USER",
    action: "SETTINGS_PROVIDERS_UPDATE",
    resourceType: "Settings",
    resourceId: "payment_providers",
    ipAddress: ip,
    userAgent: ua,
    metadata: {
      providers: Object.keys(config).map((k) => ({
        provider: k,
        enabled: config[k]?.enabled ?? false,
        mode: config[k]?.mode ?? "n/a",
      })),
    },
  });
}

// GET — list all provider configs (API keys are masked)
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } }, { status: 401 });
    if (!hasPermission(user.role as any, "settings.view" as any)) return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } }, { status: 403 });

    const config = await getConfig();
    // Mask sensitive credentials — frontend never sees raw API keys
    const masked = maskCredentials(config);
    return NextResponse.json({ success: true, data: serialize(masked) });
  } catch (e: any) {
    console.error("Providers GET error:", e?.message);
    return NextResponse.json({ success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } }, { status: 500 });
  }
}

// PATCH — update provider config (full or partial per provider)
export async function PATCH(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } }, { status: 401 });
    if (!hasPermission(user.role as any, "settings.manage" as any)) return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } }, { status: 403 });

    const body = await req.json();
    const config = await getConfig();

    // Merge each provider's config
    for (const provider of Object.keys(DEFAULT_CONFIG)) {
      if (body[provider]) {
        config[provider] = { ...config[provider], ...body[provider] };
      }
    }

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await saveConfig(config, user.id, ip, ua);

    const masked = maskCredentials(config);
    return NextResponse.json({ success: true, data: serialize(masked) });
  } catch (e: any) {
    console.error("Providers PATCH error:", e?.message);
    return NextResponse.json({ success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } }, { status: 500 });
  }
}

/** Mask API keys/secrets in config before sending to frontend. Shows first 4 + last 4 chars. */
function maskCredentials(config: any): any {
  const masked = JSON.parse(JSON.stringify(config));
  const sensitiveFields = ["apiKey", "serverKey", "clientKey", "sharedKey", "webhookToken", "payoutApiKey"];
  for (const provider of Object.keys(masked)) {
    const pc = masked[provider];
    if (typeof pc !== "object") continue;
    for (const field of sensitiveFields) {
      if (pc[field]) {
        const val = String(pc[field]);
        if (val.length > 12) {
          pc[field] = val.slice(0, 4) + "••••••••" + val.slice(-4);
        } else if (val.length > 0) {
          pc[field] = "••••••••";
        }
      }
    }
  }
  return masked;
}
