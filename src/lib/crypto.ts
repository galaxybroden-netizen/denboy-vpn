// MVMP — AES-256-GCM Credential Encryption
// Phase 12: Production-grade credential encryption for AI provider API keys.
//
// Uses Node.js crypto module with AES-256-GCM authenticated encryption.
// Each ciphertext includes: format version + nonce (12 bytes) + auth tag (16 bytes) + encrypted data.
//
// Environment variable: AI_ENCRYPTION_KEY (32-byte hex string, 64 hex chars)
// Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//
// If AI_ENCRYPTION_KEY is not set:
//   - In development: falls back to a derived key from DATABASE_URL (NOT secure, marked as dev-only)
//   - In production: refuses to encrypt/decrypt, returns null, logs error

import crypto from "node:crypto";

const ENCRYPTION_KEY_ENV = "AI_ENCRYPTION_KEY";
const CIPHER_ALGORITHM = "aes-256-gcm";
const NONCE_LENGTH = 12; // 96-bit nonce for GCM
const TAG_LENGTH = 16; // 128-bit auth tag
const FORMAT_VERSION = 1; // for future migration support

// Cached key — loaded once at module init
let cachedKey: Buffer | null = null;
let keySource: "env" | "dev-fallback" | "none" = "none";
let keyValidated = false;

function getEncryptionKey(): Buffer | null {
  if (cachedKey !== null) return cachedKey;

  const envKey = process.env[ENCRYPTION_KEY_ENV];
  if (envKey) {
    // Parse hex string (64 chars = 32 bytes)
    if (envKey.length === 64 && /^[0-9a-fA-F]+$/.test(envKey)) {
      cachedKey = Buffer.from(envKey, "hex");
      keySource = "env";
      return cachedKey;
    }
    // Could also be base64
    try {
      const decoded = Buffer.from(envKey, "base64");
      if (decoded.length === 32) {
        cachedKey = decoded;
        keySource = "env";
        return cachedKey;
      }
    } catch {}
  }

  // Development fallback — derive from DATABASE_URL (NOT secure, dev only)
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    const dbUrl = process.env.DATABASE_URL || "file:dev.db";
    // Derive a 32-byte key using scrypt — deterministic but NOT for production
    cachedKey = crypto.scryptSync(dbUrl, "mvmp-dev-salt", 32);
    keySource = "dev-fallback";
    return cachedKey;
  }

  // Production without key — refuse and crash safely
  console.error("[MVMP Crypto] FATAL: AI_ENCRYPTION_KEY not set in production mode.");
  console.error("[MVMP Crypto] Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
  console.error("[MVMP Crypto] Set it as environment variable AI_ENCRYPTION_KEY before starting the application.");
  keySource = "none";
  return null;
}

/**
 * Validate encryption key on startup.
 * In production: crashes the application if AI_ENCRYPTION_KEY is missing or invalid.
 * In development: logs a warning if using dev-fallback key.
 * Call this at application startup (e.g., in instrumentation.ts or first API load).
 */
export function validateEncryptionOnStartup(): void {
  if (keyValidated) return;
  keyValidated = true;

  const key = getEncryptionKey();
  
  if (process.env.NODE_ENV === "production") {
    if (!key || keySource !== "env") {
      const msg = "[MVMP Crypto] FATAL: AI_ENCRYPTION_KEY is required in production. Application cannot start safely.";
      console.error(msg);
      throw new Error(msg);
    }
    if (key.length !== 32) {
      const msg = "[MVMP Crypto] FATAL: AI_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters).";
      console.error(msg);
      throw new Error(msg);
    }
    console.log("[MVMP Crypto] Encryption key validated (production mode, env source).");
  } else {
    if (keySource === "dev-fallback") {
      console.warn("[MVMP Crypto] WARNING: Using dev-fallback encryption key derived from DATABASE_URL.");
      console.warn("[MVMP Crypto] This is NOT secure. Set AI_ENCRYPTION_KEY for production-grade encryption.");
    } else if (keySource === "env") {
      console.log("[MVMP Crypto] Encryption key validated (dev mode, env source).");
    }
  }
}

/** Check if encryption is available (key configured) */
export function isEncryptionAvailable(): boolean {
  return getEncryptionKey() !== null;
}

/** Get the key source for logging (never returns the actual key) */
export function getKeySource(): string {
  getEncryptionKey(); // ensure cachedKey is populated
  return keySource;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a formatted string: "v1:<hex-nonce>:<hex-tag>:<hex-ciphertext>"
 * Returns null if encryption key is not available.
 */
export function encrypt(plaintext: string): string | null {
  const key = getEncryptionKey();
  if (!key) return null;

  const nonce = crypto.randomBytes(NONCE_LENGTH);
  const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, key, nonce);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Format: v1:nonce:tag:ciphertext (all hex)
  return `v${FORMAT_VERSION}:${nonce.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt a ciphertext string encrypted with encrypt().
 * Returns the plaintext string, or null if:
 *   - Key is not available
 *   - Ciphertext is malformed
 *   - Authentication tag verification fails (tampered)
 *   - Wrong key
 */
export function decrypt(ciphertext: string | null): string | null {
  if (!ciphertext) return null;

  const key = getEncryptionKey();
  if (!key) return null;

  try {
    // Support both old base64 format (migration) and new v1 format
    if (ciphertext.startsWith("v1:")) {
      // New AES-256-GCM format: "v1:nonce:tag:ciphertext"
      const parts = ciphertext.split(":");
      if (parts.length !== 4) return null;

      const nonce = Buffer.from(parts[1], "hex");
      const tag = Buffer.from(parts[2], "hex");
      const encrypted = Buffer.from(parts[3], "hex");

      if (nonce.length !== NONCE_LENGTH || tag.length !== TAG_LENGTH) return null;

      const decipher = crypto.createDecipheriv(CIPHER_ALGORITHM, key, nonce);
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
      return decrypted.toString("utf8");
    } else {
      // Legacy base64 format — try to decode (for migration compatibility)
      // This is the old format from Phase 5-11, NOT secure
      try {
        return Buffer.from(ciphertext, "base64").toString("utf-8");
      } catch {
        return null;
      }
    }
  } catch (err: any) {
    // Auth tag verification failed = tampered or wrong key
    console.error("[MVMP Crypto] Decrypt failed:", err?.code || err?.message?.slice(0, 50));
    return null;
  }
}

/**
 * Mask a credential for display — show first 4 + last 4 chars.
 * Used when sending provider info to frontend.
 */
export function maskCredential(plaintext: string): string {
  if (!plaintext || plaintext.length < 12) return "••••••••";
  return plaintext.slice(0, 4) + "••••••••" + plaintext.slice(-4);
}

/**
 * Rotate encryption — re-encrypt all provider credentials with a new key.
 * This function should be called after changing AI_ENCRYPTION_KEY env var.
 * It reads old credentials (decrypted with old key) and re-encrypts with new key.
 * 
 * In practice: 
 * 1. Set OLD_AI_ENCRYPTION_KEY env var to the previous key
 * 2. Set AI_ENCRYPTION_KEY to the new key
 * 3. Call this function to migrate
 * 4. Remove OLD_AI_ENCRYPTION_KEY
 */
export async function rotateEncryptionKey(): Promise<{ migrated: number; failed: number }> {
  // This would be called from a migration script, not directly from API
  // Implementation would:
  // 1. Use OLD_AI_ENCRYPTION_KEY to decrypt existing credentials
  // 2. Use new AI_ENCRYPTION_KEY to re-encrypt
  // 3. Update database records
  // For now, this is a placeholder — actual rotation needs a dedicated migration script
  return { migrated: 0, failed: 0 };
}
