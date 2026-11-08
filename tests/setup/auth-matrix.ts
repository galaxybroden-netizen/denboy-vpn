// tests/setup/auth-matrix.ts
//
// Authority table derived from the project's role/permission definitions in:
//   - src/lib/auth.ts (ROLE_PERMISSIONS)
//   - src/lib/rbac.ts (role/permission resolution)
//
// This file is the SINGLE source of truth for tests. It is not runtime
// business logic. It exists so tests can assert against known-role behaviour
// without importing or depending on production modules more than necessary.

import type { Role } from './factory'

export const ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'STAFF', 'RESELLER', 'CUSTOMER']

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: [
    'dashboard.view',
    'dashboard.manage',
    'servers.view',
    'servers.manage',
    'vpn_accounts.view',
    'vpn_accounts.manage',
    'customers.view',
    'customers.manage',
    'resellers.view',
    'resellers.manage',
    'transactions.view',
    'transactions.manage',
    'payments.verify',
    'audit.view',
    'settings.view',
    'settings.manage',
  ],
  ADMIN: [
    'dashboard.view',
    'servers.view',
    'servers.manage',
    'vpn_accounts.view',
    'vpn_accounts.manage',
    'customers.view',
    'customers.manage',
    'resellers.view',
    'resellers.manage',
    'transactions.view',
    'transactions.manage',
    'payments.verify',
    'audit.view',
    'settings.view',
    'settings.manage',
  ],
  STAFF: [
    'dashboard.view',
    'servers.view',
    'vpn_accounts.view',
    'customers.view',
    'transactions.view',
    'payments.verify',
    'audit.view',
    'settings.view',
  ],
  RESELLER: [
    'dashboard.view',
    'vpn_accounts.view',
    'customers.view',
    'transactions.view',
    'packages.view',
  ],
  CUSTOMER: [
    'dashboard.view',
    'vpn_accounts.view',
    'transactions.view',
    'packages.view',
  ],
}

// Dashboard access semantics used by R-01 specification and by future security
// tests. This is a test-time authority, not production business logic.
export const DASHBOARD_ACCESS: Record<Role, {
  canSeePlatformStats: boolean
  canSeeOtherCustomersTransactions: boolean
  canSeeStaffAuditLogs: boolean
  canSeeOtherResellersData: boolean
}> = {
  SUPER_ADMIN: {
    canSeePlatformStats: true,
    canSeeOtherCustomersTransactions: true,
    canSeeStaffAuditLogs: true,
    canSeeOtherResellersData: true,
  },
  ADMIN: {
    canSeePlatformStats: true,
    canSeeOtherCustomersTransactions: true,
    canSeeStaffAuditLogs: true,
    canSeeOtherResellersData: true,
  },
  STAFF: {
    canSeePlatformStats: true,
    canSeeOtherCustomersTransactions: false,
    canSeeStaffAuditLogs: true,
    canSeeOtherResellersData: false,
  },
  RESELLER: {
    canSeePlatformStats: false,
    canSeeOtherCustomersTransactions: false,
    canSeeStaffAuditLogs: false,
    canSeeOtherResellersData: false,
  },
  CUSTOMER: {
    canSeePlatformStats: false,
    canSeeOtherCustomersTransactions: false,
    canSeeStaffAuditLogs: false,
    canSeeOtherResellersData: false,
  },
}

export function hasPermission(role: Role, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}
