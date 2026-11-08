// MVMP — Payment webhook signature verification
//
// Each gateway signs callbacks differently. Verification is mandatory: an
// unverified callback can mark any invoice as paid.
//
// Configured secrets live in the `payment.providers` SystemSetting:
//   xendit  → xendit.webhookToken
//   midtrans→ midtrans.serverKey
//   doku    → doku.sharedKey
//   ipaymu  → ipaymu.apiKey

import crypto from "node:crypto";

export type PaymentProvider = "xendit" | "midtrans" | "doku" | "ipaymu";

export const PAYMENT_PROVIDERS: PaymentProvider[] = ["xendit", "midtrans", "doku", "ipaymu"];

export type SignatureFailure =
  | "PROVIDER_NOT_CONFIGURED"
  | "MISSING_SIGNATURE"
  | "INVALID_SIGNATURE";

export interface SignatureVerdict {
  ok: boolean;
  reason?: SignatureFailure;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function hmacSha256Hex(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

function readSecret(config: any, provider: PaymentProvider): string | null {
  const entry = config?.[provider];
  if (!entry) return null;
  const secret =
    provider === "xendit"
      ? entry.webhookToken
      : provider === "midtrans"
        ? entry.serverKey
        : provider === "doku"
          ? entry.sharedKey
          : entry.apiKey;
  return typeof secret === "string" && secret.trim().length > 0 ? secret.trim() : null;
}

/**
 * Verify a provider callback. Returns a failing verdict when the secret is not
 * configured — an unconfigured gateway must reject, not accept, callbacks.
 */
export function verifyProviderSignature(input: {
  provider: PaymentProvider;
  rawBody: string;
  body: any;
  headers: Headers;
  config: any;
}): SignatureVerdict {
  const { provider, rawBody, body, headers, config } = input;
  const secret = readSecret(config, provider);

  if (!secret) return { ok: false, reason: "PROVIDER_NOT_CONFIGURED" };

  if (provider === "xendit") {
    const token = headers.get("x-callback-token") || "";
    if (!token) return { ok: false, reason: "MISSING_SIGNATURE" };
    return timingSafeEqualString(token, secret)
      ? { ok: true }
      : { ok: false, reason: "INVALID_SIGNATURE" };
  }

  if (provider === "midtrans") {
    const provided = String(body?.signature_key || "");
    if (!provided) return { ok: false, reason: "MISSING_SIGNATURE" };
    const expected = crypto
      .createHash("sha512")
      .update(
        `${body?.order_id ?? ""}${body?.status_code ?? ""}${body?.gross_amount ?? ""}${secret}`,
        "utf8"
      )
      .digest("hex");
    return timingSafeEqualString(provided.toLowerCase(), expected.toLowerCase())
      ? { ok: true }
      : { ok: false, reason: "INVALID_SIGNATURE" };
  }

  // DOKU and iPaymu: HMAC-SHA256 over the raw request body.
  const provided =
    headers.get("signature") || headers.get("x-signature") || headers.get("x-callback-signature") || "";
  if (!provided) return { ok: false, reason: "MISSING_SIGNATURE" };

  const expected = hmacSha256Hex(secret, rawBody);
  return timingSafeEqualString(provided.toLowerCase(), expected.toLowerCase())
    ? { ok: true }
    : { ok: false, reason: "INVALID_SIGNATURE" };
}

export function isPaymentProvider(value: string): value is PaymentProvider {
  return (PAYMENT_PROVIDERS as string[]).includes(value);
}
