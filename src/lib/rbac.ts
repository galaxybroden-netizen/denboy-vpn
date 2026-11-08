// MVMP — RBAC library (DB-backed, complements ROLE_PERMISSIONS const in auth.ts)
//
// Permission resolution order (most specific wins):
//   1. User's UserPermission DENY entries → deny
//   2. User's UserPermission GRANT entries → grant
//   3. User's Role permissions (via roleId → RolePermission) → grant if present
//   4. Fallback to ROLE_PERMISSIONS const (auth.ts) for backwards compat
//   5. SUPER_ADMIN role always has full access (cannot be denied)

import { db } from "@/lib/db";
import { ROLE_PERMISSIONS } from "@/lib/auth";
import type { Permission } from "@/lib/auth";

// In-memory cache for permission lookups (cleared on each request via clearCache)
// Keyed by `userId` → Set of permission keys (effective permissions after merging role + overrides)
const permissionCache = new Map<string, { keys: Set<string>; expiresAt: number }>();
const CACHE_TTL_MS = 10_000; // 10 seconds — short TTL so permission changes propagate quickly

/** Clear the permission cache for a user (call after permission/role changes). */
export function clearPermissionCache(userId?: string): void {
  if (userId) {
    permissionCache.delete(userId);
  } else {
    permissionCache.clear();
  }
}

/**
 * Get the effective set of permission keys for a user.
 * Combines: user's role permissions + user's GRANT overrides - user's DENY overrides.
 * SUPER_ADMIN always gets all permissions (override).
 */
export async function getUserPermissions(userId: string): Promise<Set<string>> {
  // Check cache
  const cached = permissionCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.keys;
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      roleId: true,
      userPermissions: {
        include: { permission: { select: { key: true } } },
      },
    },
  });

  if (!user) {
    return new Set();
  }

  // SUPER_ADMIN always has all permissions (full access — can never be locked out)
  if (user.role === "SUPER_ADMIN") {
    // Fetch all permission keys from DB (or fallback to const)
    const allPerms = await db.permission.findMany({ select: { key: true } });
    const keys = new Set<string>(allPerms.map((p) => p.key));
    // Also include all const permissions for backwards compat
    for (const p of ROLE_PERMISSIONS.SUPER_ADMIN || []) {
      keys.add(p);
    }
    cacheSet(userId, keys);
    return keys;
  }

  const keys = new Set<string>();

  // 1. Start with role permissions (DB-backed if roleId set, otherwise const fallback)
  if (user.roleId) {
    const rolePerms = await db.rolePermission.findMany({
      where: { roleId: user.roleId },
      include: { permission: { select: { key: true } } },
    });
    for (const rp of rolePerms) {
      keys.add(rp.permission.key);
    }
  }
  // Fallback: const ROLE_PERMISSIONS for this role
  const constPerms = ROLE_PERMISSIONS[user.role as keyof typeof ROLE_PERMISSIONS] || [];
  for (const p of constPerms) {
    keys.add(p);
  }

  // 2. Apply user's GRANT overrides (additions)
  for (const up of user.userPermissions) {
    if (up.mode === "GRANT") {
      keys.add(up.permission.key);
    }
  }

  // 3. Apply user's DENY overrides (removals — wins over role grant)
  for (const up of user.userPermissions) {
    if (up.mode === "DENY") {
      keys.delete(up.permission.key);
    }
  }

  cacheSet(userId, keys);
  return keys;
}

function cacheSet(userId: string, keys: Set<string>): void {
  permissionCache.set(userId, { keys, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Check if a user has a specific permission.
 * Returns true for SUPER_ADMIN always; otherwise resolves via DB + cache.
 */
export async function hasPermissionDb(userId: string, permissionKey: string): Promise<boolean> {
  const perms = await getUserPermissions(userId);
  return perms.has(permissionKey);
}

/**
 * Check multiple permissions at once — returns true if user has ALL of them.
 */
export async function hasAllPermissionsDb(userId: string, keys: string[]): Promise<boolean> {
  const perms = await getUserPermissions(userId);
  return keys.every((k) => perms.has(k));
}

/**
 * Check multiple permissions at once — returns true if user has ANY of them.
 */
export async function hasAnyPermissionDb(userId: string, keys: string[]): Promise<boolean> {
  const perms = await getUserPermissions(userId);
  return keys.some((k) => perms.has(k));
}

/**
 * Get all permissions grouped by category — for UI matrix rendering.
 * Returns: { [category: string]: Permission[] }
 */
export async function getAllPermissionsGrouped(): Promise<Record<string, Array<{
  id: string;
  key: string;
  name: string;
  description: string | null;
  action: string;
  isSensitive: boolean;
}>>> {
  const perms = await db.permission.findMany({
    orderBy: [{ category: "asc" }, { key: "asc" }],
  });
  const grouped: Record<string, any[]> = {};
  for (const p of perms) {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push(p);
  }
  return grouped;
}

/**
 * Get all roles with their permission keys — for role management UI.
 */
export async function getRolesWithPermissions(): Promise<Array<{
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  color: string;
  permissionKeys: string[];
  userCount: number;
}>> {
  const roles = await db.role.findMany({
    include: {
      rolePermissions: { include: { permission: { select: { key: true } } } },
      _count: { select: { users: true } },
    },
    orderBy: { name: "asc" },
  });
  return roles.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    color: r.color,
    permissionKeys: r.rolePermissions.map((rp) => rp.permission.key),
    userCount: r._count.users,
  }));
}

/**
 * Update a role's permissions (replace all).
 * SUPER_ADMIN role cannot have its permissions reduced (always keeps ALL).
 */
export async function updateRolePermissions(
  roleId: string,
  permissionKeys: string[],
  actorUserId: string
): Promise<{ success: boolean; error?: string }> {
  const role = await db.role.findUnique({ where: { id: roleId } });
  if (!role) return { success: false, error: "Role tidak ditemukan" };

  // SUPER_ADMIN protection: cannot remove any permission
  if (role.key === "SUPER_ADMIN") {
    const allPerms = await db.permission.findMany({ select: { id: true, key: true } });
    const allKeys = new Set(allPerms.map((p) => p.key));
    const missing = allKeys.size - permissionKeys.length;
    if (missing > 0) {
      return {
        success: false,
        error: `SUPER_ADMIN tidak boleh kehilangan izin apa pun. ${missing} izin hilang dari daftar.`,
      };
    }
  }

  // Resolve permission IDs from keys
  const perms = await db.permission.findMany({
    where: { key: { in: permissionKeys } },
    select: { id: true },
  });

  // Replace: delete all existing, then insert new
  await db.$transaction([
    db.rolePermission.deleteMany({ where: { roleId } }),
    db.rolePermission.createMany({
      data: perms.map((p) => ({ roleId, permissionId: p.id })),
    }),
  ]);

  // Clear cache for all users with this role
  const users = await db.user.findMany({ where: { roleId }, select: { id: true } });
  for (const u of users) clearPermissionCache(u.id);

  return { success: true };
}

/**
 * Set a custom user permission (GRANT or DENY).
 */
export async function setUserPermission(
  userId: string,
  permissionKey: string,
  mode: "GRANT" | "DENY",
  actorUserId: string
): Promise<{ success: boolean; error?: string }> {
  const perm = await db.permission.findUnique({ where: { key: permissionKey } });
  if (!perm) return { success: false, error: "Permission tidak ditemukan" };

  // SUPER_ADMIN cannot be denied (would lock themselves out)
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return { success: false, error: "User tidak ditemukan" };
  if (user.role === "SUPER_ADMIN" && mode === "DENY") {
    return { success: false, error: "Tidak dapat menolak izin dari SUPER_ADMIN" };
  }

  await db.userPermission.upsert({
    where: { userId_permissionId: { userId, permissionId: perm.id } },
    update: { mode },
    create: { userId, permissionId: perm.id, mode, createdBy: actorUserId },
  });

  clearPermissionCache(userId);
  return { success: true };
}

/**
 * Remove a custom user permission (revert to role default).
 */
export async function removeUserPermission(
  userId: string,
  permissionKey: string
): Promise<{ success: boolean; error?: string }> {
  const perm = await db.permission.findUnique({ where: { key: permissionKey } });
  if (!perm) return { success: false, error: "Permission tidak ditemukan" };

  await db.userPermission.deleteMany({
    where: { userId, permissionId: perm.id },
  });

  clearPermissionCache(userId);
  return { success: true };
}
