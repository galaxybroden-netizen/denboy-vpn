// MVMP — VPN credential storage helpers
//
// `secretEncrypted` holds AES-256-GCM ciphertext (see src/lib/crypto.ts).
// `publicValue` holds a masked display form only; it must never contain the
// usable secret.
//
// Legacy rows (written before this change) store Base64 in `secretEncrypted`
// and the real secret in `publicValue`. `revealCredential()` keeps them working
// until they are re-encrypted, without weakening new rows.

import { decrypt, encrypt, maskCredential } from "@/lib/crypto";

export interface StoredCredential {
  secretEncrypted?: string | null;
  publicValue?: string | null;
}

export interface CredentialFields {
  secretEncrypted: string;
  publicValue: string;
  keyVersion: string;
}

/**
 * Build the persisted fields for a new credential.
 * Throws when encryption is unavailable so we never silently fall back to
 * storing a recoverable secret.
 */
export function buildCredentialFields(secret: string): CredentialFields {
  const encrypted = encrypt(secret);
  if (!encrypted) {
    throw new Error(
      "Enkripsi kredensial tidak tersedia: AI_ENCRYPTION_KEY belum dikonfigurasi"
    );
  }
  return {
    secretEncrypted: encrypted,
    publicValue: maskCredential(secret),
    keyVersion: "v1",
  };
}

function isMasked(value: string | null | undefined): boolean {
  return !value || value.includes("•");
}

/**
 * Resolve the usable secret for config generation.
 * Order matters: pre-encryption rows gave the user `publicValue`, so it wins
 * over the legacy Base64 column to keep issued configs valid.
 */
export function revealCredential(cred: StoredCredential | null | undefined): string | null {
  if (!cred) return null;

  const ciphertext = cred.secretEncrypted ?? null;
  if (ciphertext && ciphertext.startsWith("v1:")) {
    return decrypt(ciphertext);
  }

  if (!isMasked(cred.publicValue)) {
    return cred.publicValue ?? null;
  }

  return ciphertext ? decrypt(ciphertext) : null;
}
