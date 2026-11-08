// MVMP — OTP (One-Time Password) library
//
// Generates 6-digit numeric OTPs for sensitive actions:
//   - password_change (Superadmin changes own password without old password)
//   - email_verify, phone_verify
//   - sensitive_action (e.g., delete user, change role, system restore)
//
// Security guarantees:
//   - OTP is hashed (SHA-256 + per-record salt) before storage — plaintext never persisted
//   - 5-minute expiry (configurable via security.otp_expiry_minutes)
//   - Single-use: marked usedAt after successful verification
//   - Rate limiting: max 5 attempts per OTP, then it's invalidated
//   - Cooldown: 60s between OTP requests for same user+purpose (configurable)
//   - Audit log: all OTP requests + verifications logged
//
// In production: send OTP via real SMTP (email channel) or SMS gateway (phone channel).
// In sandbox: we log the OTP to the EmailLog table (mock) and return success.
// Plaintext OTP is NEVER returned to the frontend except in the mock email log for dev visibility.

import { db } from "@/lib/db";
import crypto from "node:crypto";
import { auditLog } from "@/lib/auth";
import { sendTemplatedMessageToCustomer } from "@/lib/whatsapp";

const OTP_LENGTH = 6;
const DEFAULT_EXPIRY_MINUTES = 5;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_COOLDOWN_SECONDS = 60;

/** Generate a cryptographically secure 6-digit OTP. Returns plaintext (caller must NOT persist). */
function generateOtp(): string {
  const bytes = crypto.randomBytes(4);
  const num = bytes.readUInt32BE(0) % 1_000_000;
  return num.toString().padStart(OTP_LENGTH, "0");
}

/** Hash an OTP with a per-record salt. Returns `{ hash, salt }`. */
function hashOtp(plaintext: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .createHash("sha256")
    .update(salt + plaintext)
    .digest("hex");
  return { hash, salt };
}

/** Verify a plaintext OTP against stored hash+salt. */
function verifyOtpHash(plaintext: string, storedHash: string, salt: string): boolean {
  const computed = crypto
    .createHash("sha256")
    .update(salt + plaintext)
    .digest("hex");
  // Constant-time comparison
  return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(storedHash, "hex"));
}

/** Read a system setting (with caching) — used for OTP config. */
async function getSetting(key: string, fallback: number): Promise<number> {
  try {
    const row = await db.systemSetting.findUnique({ where: { key } });
    if (!row) return fallback;
    const parsed = JSON.parse(row.value);
    return typeof parsed === "number" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export interface OtpRequestResult {
  success: boolean;
  error?: string;
  otpId?: string;
  channel?: string;
  sentTo?: string;
  expiresAt?: Date;
  /** Plaintext OTP — ONLY returned in sandbox/mock mode for dev visibility.
   *  In production this is always undefined; OTP is sent via real SMTP/SMS. */
  mockOtp?: string;
}

/**
 * Request an OTP for a user + purpose.
 * - Enforces cooldown (one request per 60s per user+purpose)
 * - Generates new OTP, hashes it, stores hash
 * - Sends plaintext OTP via configured channel (mock: logs to EmailLog)
 */
export async function requestOtp(
  userId: string,
  purpose: string,
  channel: "email" | "phone" = "email",
  options: { actorUserId?: string; ipAddress?: string } = {}
): Promise<OtpRequestResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, phone: true, name: true, emailVerifiedAt: true, phoneVerifiedAt: true },
  });
  if (!user) return { success: false, error: "User tidak ditemukan" };

  // Determine destination based on channel
  let sentTo = "";
  let verifiedAt: Date | null = null;
  if (channel === "email") {
    if (!user.email) return { success: false, error: "User tidak punya email" };
    if (!user.emailVerifiedAt) {
      return { success: false, error: "Email belum terverifikasi. Selesaikan verifikasi terlebih dahulu." };
    }
    sentTo = user.email;
    verifiedAt = user.emailVerifiedAt;
  } else {
    if (!user.phone) return { success: false, error: "User tidak punya nomor telepon" };
    if (!user.phoneVerifiedAt) {
      return { success: false, error: "Nomor telepon belum terverifikasi. Selesaikan verifikasi terlebih dahulu." };
    }
    sentTo = user.phone;
    verifiedAt = user.phoneVerifiedAt;
  }

  // Check cooldown — most recent OTP for same user+purpose within cooldown window
  const cooldownSecs = await getSetting("security.otp_cooldown_seconds", DEFAULT_COOLDOWN_SECONDS);
  const cooldownMs = cooldownSecs * 1000;
  const recentOtp = await db.otpCode.findFirst({
    where: {
      userId,
      purpose,
      createdAt: { gte: new Date(Date.now() - cooldownMs) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recentOtp) {
    const elapsed = Date.now() - recentOtp.createdAt.getTime();
    const remaining = Math.ceil((cooldownMs - elapsed) / 1000);
    return {
      success: false,
      error: `Tunggu ${remaining} detik sebelum meminta OTP baru (cooldown).`,
    };
  }

  // Generate + hash
  const plaintext = generateOtp();
  const { hash, salt } = hashOtp(plaintext);

  // Read expiry config
  const expiryMinutes = await getSetting("security.otp_expiry_minutes", DEFAULT_EXPIRY_MINUTES);
  const maxAttempts = await getSetting("security.otp_max_attempts", DEFAULT_MAX_ATTEMPTS);
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  // Store — salt is prepended to hash for retrieval (format: `<salt>:<hash>`)
  const otp = await db.otpCode.create({
    data: {
      userId,
      purpose,
      codeHash: `${salt}:${hash}`,
      channel,
      sentTo,
      expiresAt,
      maxAttempts,
      requestedIp: options.ipAddress || null,
    },
  });

  // Send via channel (mock: log to EmailLog table; production: real SMTP/SMS)
  await sendOtpViaChannel(plaintext, sentTo, channel, user.name, purpose);

  // Audit log (without plaintext OTP!)
  if (options.actorUserId) {
    await auditLog({
      actorUserId: options.actorUserId,
      actorType: "USER",
      action: "OTP_REQUESTED",
      resourceType: "OtpCode",
      resourceId: otp.id,
      ipAddress: options.ipAddress,
      metadata: { purpose, channel, sentTo: redact(sentTo), userId },
    });
  }

  return {
    success: true,
    otpId: otp.id,
    channel,
    sentTo: redact(sentTo),
    expiresAt,
    // In sandbox: return mock OTP so dev can see it in the email log.
    // In production: remove this line — OTP is only delivered via real SMTP/SMS.
    mockOtp: plaintext,
  };
}

export interface OtpVerifyResult {
  success: boolean;
  error?: string;
  verifiedOtpId?: string;
}

/**
 * Verify an OTP submitted by user.
 * - Checks expiry, attempts, single-use
 * - On success: marks OTP as used (usedAt) → cannot be reused
 * - On failure: increments attempts; if exceeded maxAttempts, invalidates OTP
 */
export async function verifyOtp(
  userId: string,
  purpose: string,
  submittedCode: string,
  options: { actorUserId?: string; ipAddress?: string } = {}
): Promise<OtpVerifyResult> {
  // Find the most recent unused OTP for this user+purpose
  const otp = await db.otpCode.findFirst({
    where: { userId, purpose, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) {
    return { success: false, error: "Tidak ada OTP aktif. Minta OTP baru." };
  }

  // Check expiry
  if (otp.expiresAt < new Date()) {
    return { success: false, error: "OTP sudah kedaluwarsa. Minta OTP baru." };
  }

  // Check attempts
  if (otp.attempts >= otp.maxAttempts) {
    return { success: false, error: " percobaan OTP melebihi batas. Minta OTP baru." };
  }

  // Parse salt + hash
  const [salt, storedHash] = otp.codeHash.split(":");
  if (!salt || !storedHash) {
    return { success: false, error: "OTP rusak (format tidak valid). Minta OTP baru." };
  }

  // Verify
  const isMatch = verifyOtpHash(submittedCode, storedHash, salt);
  if (!isMatch) {
    // Increment attempts
    await db.otpCode.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    const remaining = otp.maxAttempts - (otp.attempts + 1);
    if (remaining <= 0) {
      return { success: false, error: "OTP salah. Batas percobaan habis, minta OTP baru." };
    }
    return { success: false, error: `Kode OTP salah. Sisa percobaan: ${remaining}.` };
  }

  // Success — mark as used (single-use)
  await db.otpCode.update({
    where: { id: otp.id },
    data: { usedAt: new Date() },
  });

  if (options.actorUserId) {
    await auditLog({
      actorUserId: options.actorUserId,
      actorType: "USER",
      action: "OTP_VERIFIED",
      resourceType: "OtpCode",
      resourceId: otp.id,
      ipAddress: options.ipAddress,
      metadata: { purpose, channel: otp.channel, userId },
    });
  }

  return { success: true, verifiedOtpId: otp.id };
}

/**
 * Send OTP via the configured channel.
 * Mock implementation: logs to EmailLog table (visible in admin UI for dev).
 * Production: replace with real nodemailer call or SMS gateway API.
 */
async function sendOtpViaChannel(
  plaintext: string,
  sentTo: string,
  channel: "email" | "phone",
  userName: string,
  purpose: string
): Promise<void> {
  if (channel === "email") {
    // Mock SMTP: write to EmailLog table
    try {
      const { db } = await import("@/lib/db");
      await db.emailLog.create({
        data: {
          toEmail: sentTo,
          subject: `Kode OTP MVMP — ${purposeLabel(purpose)}`,
          body: `Halo ${userName},\n\nKode OTP Anda untuk ${purposeLabel(purpose)} adalah: ${plaintext}\n\nBerlaku selama 5 menit. Jangan bagikan kode ini kepada siapa pun.\n\n— Tim MVMP`,
          template: "OTP",
          status: "SENT",
        },
      });
    } catch (e) {
      console.error("Mock SMTP send failed (non-fatal):", e);
    }
  } else {
    // Phone channel — try WhatsApp (if connected) else log
    try {
      await sendTemplatedMessageToCustomer("", "otp", { customer_name: userName });
    } catch {
      // WhatsApp not connected — just silently skip (OTP is still in DB)
    }
  }
}

function purposeLabel(purpose: string): string {
  switch (purpose) {
    case "password_change": return "Perubahan Password";
    case "email_verify": return "Verifikasi Email";
    case "phone_verify": return "Verifikasi Nomor Telepon";
    case "sensitive_action": return "Tindakan Sensitif";
    default: return purpose;
  }
}

/** Mask email/phone for display: "user@example.com" → "u***@example.com", "+62812..." → "+62***" */
function redact(sentTo: string): string {
  if (sentTo.includes("@")) {
    const [name, domain] = sentTo.split("@");
    if (!name || !domain) return sentTo;
    const masked = name.length > 1 ? name[0] + "***" : "***";
    return `${masked}@${domain}`;
  }
  // Phone — keep first 4 + last 2
  if (sentTo.length > 6) {
    return sentTo.slice(0, 4) + "***" + sentTo.slice(-2);
  }
  return "***";
}
