// tests/fixtures/roles.ts
// Role constants matching the project's role definitions.
export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'STAFF', 'RESELLER', 'CUSTOMER'] as const
export type Role = (typeof ROLES)[number]
