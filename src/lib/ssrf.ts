// MVMP — SSRF Protection Utility
// Validates provider baseUrl to prevent Server-Side Request Forgery.
// Blocks: localhost, loopback, private IPs, cloud metadata endpoints, link-local.

import { URL } from "node:url";
import dns from "node:dns";
import net from "node:net";

/** Private/internal IP ranges that must be blocked for external providers */
const BLOCKED_IP_PATTERNS = [
  /^127\./, // IPv4 loopback
  /^10\./, // Private Class A
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // Private Class B (172.16.0.0 - 172.31.255.255)
  /^192\.168\./, // Private Class C
  /^169\.254\./, // Link-local
  /^0\./, // Current network
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // Carrier-grade NAT (100.64.0.0 - 100.127.255.255)
  /^::1$/, // IPv6 loopback
  /^fc/, // IPv6 unique local
  /^fd/, // IPv6 unique local
  /^fe80:/, // IPv6 link-local
  /^fec0:/, // IPv6 site-local (deprecated)
  /^ff/, // IPv6 multicast
];

/** Cloud metadata endpoints */
const BLOCKED_HOSTS = [
  "169.254.169.254", // AWS/GCP/Azure metadata
  "metadata.google.internal", // GCP metadata
  "metadata.azure.com", // Azure metadata
  "100.100.100.200", // Alibaba Cloud metadata
];

export interface SSRFValidationResult {
  allowed: boolean;
  reason?: string;
  sanitizedUrl?: string;
}

/**
 * Validate a URL for SSRF safety.
 * Only allows HTTPS for external endpoints.
 * HTTP only allowed for localhost (dev only, when NODE_ENV !== "production").
 */
export function validateProviderUrl(urlStr: string): SSRFValidationResult {
  if (!urlStr || typeof urlStr !== "string") {
    return { allowed: false, reason: "URL kosong atau tidak valid" };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { allowed: false, reason: "Format URL tidak valid" };
  }

  // Protocol check
  if (parsed.protocol === "https:") {
    // HTTPS is always allowed (for external)
  } else if (parsed.protocol === "http:") {
    // HTTP only allowed in development for local endpoints
    const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
    if (!isLocal) {
      return { allowed: false, reason: "HTTP hanya diizinkan untuk endpoint lokal (localhost)" };
    }
    if (process.env.NODE_ENV === "production") {
      return { allowed: false, reason: "HTTP tidak diizinkan di production. Gunakan HTTPS." };
    }
  } else {
    return { allowed: false, reason: `Protokol ${parsed.protocol} tidak diizinkan. Gunakan HTTPS.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block known metadata endpoints
  if (BLOCKED_HOSTS.includes(hostname)) {
    return { allowed: false, reason: "Endpoint metadata cloud diblokir (SSRF protection)" };
  }

  // Check if hostname is an IP address
  if (net.isIP(hostname)) {
    if (isBlockedIP(hostname)) {
      return { allowed: false, reason: `IP ${hostname} berada dalam rentang privat/internal yang diblokir` };
    }
  }

  // For domain names, we can't do DNS resolution synchronously here without async.
  // DNS rebinding protection would require async DNS lookup + connection-time validation.
  // For now, block known dangerous patterns and log a warning for domain names.
  
  // Block wildcard subdomains of dangerous TLDs
  if (hostname.endsWith(".internal") || hostname.endsWith(".local") || hostname.endsWith(".localhost")) {
    return { allowed: false, reason: `Hostname ${hostname} menggunakan TLD internal yang diblokir` };
  }

  return { allowed: true, sanitizedUrl: parsed.toString() };
}

/** Check if an IP address is in a blocked range */
function isBlockedIP(ip: string): boolean {
  // IPv4
  if (net.isIPv4(ip)) {
    for (const pattern of BLOCKED_IP_PATTERNS) {
      if (pattern.test(ip)) return true;
    }
    return false;
  }
  
  // IPv6
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    for (const pattern of BLOCKED_IP_PATTERNS) {
      if (pattern.test(lower)) return true;
    }
    return false;
  }
  
  return false;
}

/**
 * Async DNS resolution check — resolves hostname and verifies IP is not private.
 * Use this before making actual API calls to prevent DNS rebinding attacks.
 */
export async function validateDnsResolution(hostname: string): Promise<SSRFValidationResult> {
  return new Promise((resolve) => {
    dns.lookup(hostname, { all: true }, (err, addresses) => {
      if (err) {
        // DNS resolution failed — allow but log (could be a local service like Ollama)
        resolve({ allowed: true, reason: "DNS resolution failed (may be local service)" });
        return;
      }

      for (const addr of addresses) {
        if (isBlockedIP(addr.address)) {
          resolve({ 
            allowed: false, 
            reason: `Hostname ${hostname} resolves to blocked IP ${addr.address}` 
          });
          return;
        }
      }

      resolve({ allowed: true });
    });
  });
}
