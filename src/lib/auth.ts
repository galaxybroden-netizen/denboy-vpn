// MVMP — Authentication & RBAC helpers
import { cookies } from "next/headers";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { db } from "./db";

// Re-export auditLog so callers can use a single import line:
//   import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
export { auditLog } from "./utils-mvmp";

const SESSION_COOKIE = "mvmp_session";
const SESSION_TTL_HOURS = 24;

export type Permission =
  | "dashboard.view"
  | "servers.view"
  | "servers.manage"
  | "protocols.view"
  | "protocols.manage"
  | "vpn_accounts.view"
  | "vpn_accounts.manage"
  | "customers.view"
  | "customers.manage"
  | "resellers.view"
  | "resellers.manage"
  | "packages.view"
  | "packages.manage"
  | "transactions.view"
  | "transactions.manage"
  | "payments.verify"
  | "monitoring.view"
  | "audit.view"
  | "settings.view"
  | "settings.manage"
  | "ai.view"
  | "ai.manage"
  | "whatsapp.view"
  | "whatsapp.manage"
  | "users.manage";

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  SUPER_ADMIN: [
    "dashboard.view", "servers.view", "servers.manage", "protocols.view", "protocols.manage",
    "vpn_accounts.view", "vpn_accounts.manage", "customers.view", "customers.manage",
    "resellers.view", "resellers.manage", "packages.view", "packages.manage",
    "transactions.view", "transactions.manage", "payments.verify", "monitoring.view",
    "audit.view", "settings.view", "settings.manage", "ai.view", "ai.manage", "whatsapp.view", "whatsapp.manage", "users.manage",
  ],
  ADMIN: [
    "dashboard.view", "servers.view", "servers.manage", "protocols.view", "protocols.manage",
    "vpn_accounts.view", "vpn_accounts.manage", "customers.view", "customers.manage",
    "resellers.view", "packages.view", "packages.manage",
    "transactions.view", "transactions.manage", "payments.verify", "monitoring.view",
    "audit.view", "settings.view", "ai.view", "whatsapp.view", "whatsapp.manage",
  ],
  RESELLER: [
    "dashboard.view", "vpn_accounts.view", "customers.view", "transactions.view", "packages.view",
  ],
  CUSTOMER: [
    "dashboard.view", "vpn_accounts.view", "transactions.view", "packages.view",
  ],
};

export function hasPermission(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export async function createSession(userId: string, ipAddress?: string, userAgent?: string) {
  const token = uuidv4() + "." + uuidv4();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);

  await db.session.create({
    data: {
      userId,
      token,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      expiresAt,
    },
  });

  await db.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });

  return { token, expiresAt };
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < new Date()) return null;

  return session.user;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return;

  await db.session.updateMany({
    where: { token },
    data: { revokedAt: new Date() },
  });
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_MAX_AGE = SESSION_TTL_HOURS * 3600;

export function setSessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

export function clearSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}
