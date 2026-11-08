// MVMP — Utility helpers (audit log, formatting, serialization)
import { db } from "./db";
import {
  CURRENCIES,
  convertCurrency,
  getDisplayCurrency,
  type CurrencyCode,
} from "./currency";

export async function auditLog(params: {
  actorUserId?: string | null;
  actorType?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}) {
  try {
    await db.auditLog.create({
      data: {
        actorUserId: params.actorUserId || null,
        actorType: params.actorType || "USER",
        action: params.action,
        resourceType: params.resourceType || null,
        resourceId: params.resourceId || null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  } catch (e) {
    // Audit log failure should not break the request
    console.error("Audit log failed:", e);
  }
}

// Convert BigInt & Date fields to JSON-safe
export function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => (typeof v === "bigint" ? Number(v) : v)));
}

export function formatBytes(bytes: number | bigint): string {
  const b = typeof bytes === "bigint" ? Number(bytes) : bytes;
  if (b === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatBytesShort(bytes: number | bigint): string {
  const b = typeof bytes === "bigint" ? Number(bytes) : bytes;
  if (b === 0) return "0B";
  const units = ["B", "K", "M", "G", "T", "P"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)}${units[i]}`;
}

/**
 * Format an amount for display, converting it from its stored currency to the
 * global display currency (IDR/USD/EUR — Batch 3). Amounts without an explicit
 * currency are treated as IDR (the base currency of the database).
 */
export function formatCurrency(amount: number, currency: string = "IDR"): string {
  const from: CurrencyCode =
    currency === "IDR" || currency === "USD" || currency === "EUR" ? currency : "IDR";
  const to = getDisplayCurrency();
  return formatInCurrency(convertCurrency(amount, from, to), to);
}

/** Format without conversion — keeps the record's own currency (invoices/PDF). */
export function formatCurrencyRaw(amount: number, currency = "IDR"): string {
  const code: CurrencyCode =
    currency === "IDR" || currency === "USD" || currency === "EUR" ? currency : "IDR";
  return formatInCurrency(amount, code);
}

function formatInCurrency(amount: number, code: CurrencyCode): string {
  const meta = CURRENCIES[code];
  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency: code,
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  }).format(amount);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}

export function formatDateTime(date: Date | string | null): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

export function formatDate(date: Date | string | null): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

export function timeAgo(date: Date | string | null): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec} detik lalu`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} hari lalu`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} bulan lalu`;
  return `${Math.floor(month / 12)} tahun lalu`;
}

export function maskIp(ip: string): string {
  return ip;
}

export function getCountryFlag(code: string): string {
  const flags: Record<string, string> = {
    ID: "🇮🇩",
    SG: "🇸🇬",
    US: "🇺🇸",
    NL: "🇳🇱",
    DE: "🇩🇪",
    JP: "🇯🇵",
    HK: "🇭🇰",
    IN: "🇮🇳",
  };
  return flags[code.toUpperCase()] || "🌐";
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    ONLINE: "emerald",
    OFFLINE: "rose",
    PENDING: "amber",
    ACTIVE: "emerald",
    SUSPENDED: "amber",
    EXPIRED: "zinc",
    DEPLETED: "orange",
    REVOKED: "rose",
    ERROR: "rose",
    PAID: "emerald",
    FAILED: "rose",
    CANCELLED: "zinc",
    REFUNDED: "amber",
    REVIEW_REQUIRED: "amber",
    RUNNING: "emerald",
    STOPPED: "zinc",
    INSTALLED: "emerald",
    INSTALLING: "amber",
    NOT_INSTALLED: "zinc",
    UNINSTALLING: "amber",
    QUEUED: "amber",
    PROCESSING: "blue",
    SUCCESS: "emerald",
    DECOMMISSIONED: "zinc",
    DEGRADED: "amber",
    UNAUTHORIZED: "rose",
  };
  return map[status] || "zinc";
}
