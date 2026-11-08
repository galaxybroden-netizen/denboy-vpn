// tests/setup/db.ts
// Disposable Prisma client backed by in-memory SQLite for tests only.
// The production database is never touched by these helpers.

import { PrismaClient } from '@prisma/client'

export function createTestDb(): PrismaClient {
  const db = new PrismaClient({
    datasources: { sqlite: { url: 'file:/memory:?cache=shared' } },
    log: ['error'],
  })
  return db
}

export async function connectTestDb(db: PrismaClient): Promise<void> {
  await db.$connect()
}

export async function disconnectTestDb(db: PrismaClient): Promise<void> {
  await db.$disconnect()
}
