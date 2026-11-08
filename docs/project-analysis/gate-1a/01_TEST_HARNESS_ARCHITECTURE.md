# GATE 1A — TEST HARNESS ARCHITECTURE

## 1. Goals

- Smallest practical harness that proves `bun test` works end-to-end.
- Testable domain helpers (auth, rbac, tenant-scope, crypto) without changing them.
- Isolated, disposable database per test suite via in-memory SQLite.
- Role/tenant fixtures for security tests.
- Clear ownership: tests only, no production code.

## 2. Runner

`bun test` (Bun 1.4.4, no new dependency).

## 3. Directory structure

```
tests/
  setup/
    db.ts            - disposable Prisma client, in-memory SQLite
    factory.ts       - staff/reseller/customer/transaction fixtures
    auth-matrix.ts   - roles/permissions authority table
  fixtures/
    roles.ts         - role constants
    permissions.ts   - permission constants
  helpers/
    principal.ts     - principal simulation
    mock-cookies.ts  - minimal cookie/headers mock for route-style tests
    mock-db.ts       - in-memory Prisma stub for pure unit tests
  unit/
    smoke.test.ts
    failure-behavior.test.ts
  security/           - reserved for R-01 and related tests (not yet written)
  integration/        - reserved for postgres-backed integration tests (future)
```

## 4. Database strategy

PrismaClient with `DATABASE_URL=file:/memory:?cache=shared`. Each suite creates
its own client and drops/creates schema as needed. This is strictly local and
in-memory; the production database is never touched.

## 5. Fixtures and helpers

Fixtures create minimal rows needed by tests: staff user, reseller, customer, and
optionally transactions/payments for security scenarios. They do not seed large
or production-like volumes.

## 6. Mocks

Where a route depends on Next.js request context (`cookies()`, `headers()`), the
harness uses a minimal mock rather than the real API. This is acceptable because
the domain helpers we care about are pure or near-pure and are tested directly.

## 7. Scope discipline

- No production logic changed to make tests easier.
- No new dependency.
- No test that connects to real services.
- No test in this release that asserts the dashboard fix — that fix is not
  implemented yet. The harness is ready to host such tests once R-01 spec is
  approved and implemented.

## 8. Execution model

`bun test` discovers and runs files matching the default pattern. Scripts:
- `test` — run all.
- `test:unit` — unit smoke/failure tests.
- `test:security` — reserved for security tests when implemented.

## 9. Ownership

Tests are owned by the security workstream. They may be expanded as later gates
are approved, but they are not refactored away from this minimal shape without
owner agreement.
