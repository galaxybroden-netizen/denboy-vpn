// tests/setup/factory.ts
// Minimal fixtures for security tests. Creates only the rows a test needs.

import { PrismaClient } from '@prisma/client'
import { db as createDb } from './db'

export type TestDb = ReturnType<typeof createTestDb>

// ---- Role/permission helpers are derived from the authoritative matrix in
//      tests/setup/auth-matrix.ts rather than from production code at runtime.
//      This keeps fixtures deterministic and avoids coupling test setup to
//      production business logic.
//
//      The actual role and permission keys must match the project's
//      definitions: see tests/fixtures/roles.ts and tests/fixtures/permissions.ts.

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | 'RESELLER' | 'CUSTOMER'

export async function createUser(db: TestDb, role: Role): Promise<{
  id: string
  email: string
  name: string
  role: string
}> {
  const email = `test-${role}-${Math.random().toString(36).slice(2)}@example.test`
  return db.user.create({
    data: {
      email,
      username: `test-${role}-user`,
      name: `Test ${role}`,
      passwordHash: 'hashed',
      role,
    },
    select: { id: true, email: true, name: true, role: true },
  })
}

export async function createReseller(db: TestDb, user: { id: string }): Promise<{
  id: string
  parentResellerId: string | null
}> {
  return db.reseller.create({
    data: { userId: user.id, name: 'Test Reseller' },
    select: { id: true, parentResellerId: true },
  })
}

export async function createCustomer(
  db: TestDb,
  user: { id: string },
  resellerId?: string,
): Promise<{
  id: string
  resellerId: string | null
}> {
  return db.customer.create({
    data: {
      userId: user.id,
      name: 'Test Customer',
      email: 'customer@example.test',
      resellerId: resellerId ?? null,
    },
    select: { id: string, resellerId: string | null },
  })
}

export async function createTransaction(
  db: TestDb,
  customerId: string,
  resellerId?: string,
): Promise<{ id: string; customerId: string; resellerId: string | null; amount: number }> {
  return db.transaction.create({
    data: {
      customerId,
      resellerId: resellerId ?? null,
      amount: 100000,
      currency: 'IDR',
      status: 'PAID',
      invoiceNumber: `INV-${Math.random().toString(36).slice(2)}`,
      idempotencyKey: `idem-${Math.random().toString(36).slice(2)}`,
    },
    select: { id: true, customerId: true, resellerId: true, amount: true },
  })
}

export async function createAuditLog(
  db: TestDb,
  actorUserId: string,
  action: string,
  resourceType?: string,
  resourceId?: string,
): Promise<{ id: string; actorUserId: string; action: string }> {
  return db.auditLog.create({
    data: {
      actorUserId,
      action,
      resourceType: resourceType ?? null,
      resourceId: resourceId ?? null,
    },
    select: { id: true, actorUserId: true, action: true },
  })
}
