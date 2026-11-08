// tests/helpers/principal.ts
//
// Constructs minimal principal-like objects for tests.
// This is a test helper, not production authentication.
//
// In the real application, a principal would come from getSessionUser().
// For tests we build a minimal shape that downstream helpers can accept.

export interface Principal {
  id: string
  role: string
  email: string
  name: string
}

export function makePrincipal(overrides: Partial<Principal> = {}): Principal {
  return {
    id: 'principal-test-id',
    role: 'SUPER_ADMIN',
    email: 'principal@test.test',
    name: 'Principal Test',
    ...overrides,
  }
}

export function makeCustomerPrincipal(): Principal {
  return makePrincipal({ role: 'CUSTOMER', email: 'customer@test.test', name: 'Customer A' })
}

export function makeResellerPrincipal(): Principal {
  return makePrincipal({ role: 'RESELLER', email: 'reseller@test.test', name: 'Reseller A' })
}

export function makeStaffPrincipal(): Principal {
  return makePrincipal({ role: 'STAFF', email: 'staff@test.test', name: 'Staff A' })
}

export function makeSuperAdminPrincipal(): Principal {
  return makePrincipal({ role: 'SUPER_ADMIN', email: 'superadmin@test.test', name: 'Super Admin' })
}
