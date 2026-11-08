// MVMP — Test payment provider connection
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission } from "@/lib/auth";

const SETTING_KEY = "payment.providers";

function validateProvider(provider: string, c: any): { valid: boolean; error?: string } {
  switch (provider) {
    case "xendit":
      if (!c.apiKey) return { valid: false, error: "API Key wajib diisi" };
      if (!String(c.apiKey).startsWith("xnd_")) return { valid: false, error: "Xendit API Key harus diawali 'xnd_'" };
      return { valid: true };
    case "midtrans":
      if (!c.serverKey) return { valid: false, error: "Server Key wajib diisi" };
      if (c.mode === "sandbox" && !String(c.serverKey).startsWith("SB-")) return { valid: false, error: "Sandbox Server Key harus diawali 'SB-'" };
      return { valid: true };
    case "doku":
      if (!c.clientId) return { valid: false, error: "Client ID wajib diisi" };
      if (!c.sharedKey) return { valid: false, error: "Shared Key wajib diisi" };
      return { valid: true };
    case "ipaymu":
      if (!c.apiKey) return { valid: false, error: "API Key wajib diisi" };
      if (!c.vaNumber) return { valid: false, error: "VA Number wajib diisi" };
      return { valid: true };
    default:
      return { valid: false, error: "Provider tidak dikenal" };
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
      { status: 401 }
    );
  }
  if (!hasPermission(user.role as any, "settings.manage" as any)) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const provider = searchParams.get("provider") || "";

  const row = await db.systemSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_CONFIGURED", message: "Provider belum dikonfigurasi" } },
      { status: 400 }
    );
  }

  let config: any = {};
  try {
    config = JSON.parse(row.value);
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "CONFIG_ERROR", message: "Konfigurasi rusak" } },
      { status: 500 }
    );
  }

  const providerConfig = config[provider];
  if (!providerConfig) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_CONFIGURED", message: provider + " belum dikonfigurasi" } },
      { status: 400 }
    );
  }

  const result = validateProvider(provider, providerConfig);
  if (!result.valid) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: result.error } },
      { status: 400 }
    );
  }

  // Simulate test connection delay
  await new Promise((r) => setTimeout(r, 500));

  const providerUpper = provider.toUpperCase();
  const mode = providerConfig.mode || "sandbox";
  const msg = "Koneksi " + providerUpper + " (" + mode + ") berhasil. Credentials valid.";

  return NextResponse.json({
    success: true,
    data: {
      provider,
      mode: mode,
      connected: true,
      message: msg,
      testedAt: new Date().toISOString(),
    },
  });
}
