// tests/fixtures/permissions.ts
// Permission key constants matching the project definitions.
export const PERMISSIONS = [
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
] as const
export type Permission = (typeof PERMISSIONS)[number]
