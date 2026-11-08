// tests/helpers/mock-db.ts
// Light in-memory stub for tests that need a Prisma-like client but should not
// touch any database at all.
//
// This is intentionally minimal. It is for pure unit tests only.

export interface MockRecord {
  id: string
  [key: string]: unknown
}

export class MockDb {
  private store: Map<string, MockRecord> = new Map()

  create<T extends Record<string, unknown>>(data: T & { id?: string }): T & { id: string } {
    const id = (data as { id?: string }).id ?? crypto.randomUUID()
    const record = { ...data, id } as T & { id: string }
    this.store.set(String(id), record)
    return record
  }

  findUnique<T>(criteria: { where: Record<string, unknown> }): T | null {
    const id = criteria.where.id
    return (this.store.get(String(id)) as T) ?? null
  }

  count(): number {
    return this.store.size
  }
}
