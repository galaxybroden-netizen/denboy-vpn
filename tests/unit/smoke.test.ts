// tests/unit/smoke.test.ts
// Minimal smoke test proving the harness works and that the auth matrix is
// coherent. These assertions are about the test authority table, not about any
// production route handler. They verify the same role/permission classifications
// that the R-01 spec will use.
import { describe, it, expect } from 'bun:test'
import { ROLE_PERMISSIONS, DASHBOARD_ACCESS, hasPermission } from '../setup/auth-matrix'

describe('auth matrix coherence', () => {
  it('SUPER_ADMIN has dashboard.view and dashboard.manage', () => {
    expect(hasPermission('SUPER_ADMIN', 'dashboard.view')).toBe(true)
    expect(hasPermission('SUPER_ADMIN', 'dashboard.manage')).toBe(true)
  })

  it('ADMIN has dashboard.view but not necessarily dashboard.manage in the strictest role model', () => {
    expect(hasPermission('ADMIN', 'dashboard.view')).toBe(true)
    // ADMIN should be able to see platform-level dashboard data.
    expect(DASHBOARD_ACCESS.ADMIN.canSeePlatformStats).toBe(true)
  })

  it('CUSTOMER has dashboard.view but must NOT see other customers transactions', () => {
    expect(hasPermission('CUSTOMER', 'dashboard.view')).toBe(true)
    expect(DASHBOARD_ACCESS.CUSTOMER.canSeeOtherCustomersTransactions).toBe(false)
    expect(DASHBOARD_ACCESS.CUSTOMER.canSeeStaffAuditLogs).toBe(false)
  })

  it('RESELLER has dashboard.view but must NOT see other resellers data', () => {
    expect(hasPermission('RESELLER', 'dashboard.view')).toBe(true)
    expect(DASHBOARD_ACCESS.RESELLER.canSeeOtherResellersData).toBe(false)
  })

  it('STAFF must not see other customers transactions, but may see staff audit logs', () => {
    expect(DASHBOARD_ACCESS.STAFF.canSeeOtherCustomersTransactions).toBe(false)
    expect(DASHBOARD_ACCESS.STAFF.canSeeStaffAuditLogs).toBe(true)
  })
})
