# G6 — GATE 1A TEST HARNESS REVIEW

**Reviewer role:** Independent technical reviewer (read-only)  
**Findings:** one structural defect in the failure-behavior test; harness is a real
foundation but not yet a security-testing platform.

---

## 1. What was checked

Files inspected:
- `docs/project-analysis/gate-1a/00…05.md`
- `tests/unit/smoke.test.ts`
- `tests/unit/failure-behavior.test.ts`
- `tests/setup/db.ts`
- `tests/setup/factory.ts`
- `tests/setup/auth-matrix.ts`
- `tests/helpers/principal.ts`
- `tests/helpers/mock-db.ts`
- `tests/helpers/mock-cookies.ts`
- `tests/fixtures/roles.ts`
- `tests/fixtures/permissions.ts`
- `package.json`
- `bun.lock` and `bun pm ls` output
- `tsconfig.json`
- `next.config.ts`

Also executed:
- `bun test tests/unit/smoke.test.ts` — 5 pass, 0 fail
- `bun test tests/unit/failure-behavior.test.ts` — 0 pass, 1 fail, exit 1
- `bun test tests/unit` — 5 pass, 1 fail, exit 1
- `bun test` — discovers both files, exits 1 because of the failing file

---

## 2. Runner and dependency check

- Runner: `bun test`, the built-in Bun test runner. Verified present and working.
- No new dependency added. `package.json` unchanged. `bun.lock` exists and was
  not modified. `bun pm ls` shows the installed tree without the new test files
  affecting it.

This satisfies the G5 requirement for minimal dependency footprint.

---

## 3. Test structure review

### 3.1 Directory layout
- `tests/unit/`, `tests/setup/`, `tests/helpers/`, `tests/fixtures/`,
  `tests/security/`, `tests/integration/`

The layout is reasonable for a minimal harness. Security and integration dirs
exist but are empty, which is fine.

### 3.2 Test isolation
- `tests/setup/db.ts` creates a PrismaClient with an in-memory SQLite URL
  `file:/memory:?cache=shared`. This is isolated and non-destructive.
- `factory.ts` creates test users, resellers, customers, transactions, and audit
  logs through Prisma. This is acceptable for future integration tests but has
  not been exercised yet.

### 3.3 Mocks
- `mock-db.ts` is a tiny in-memory store. Useful for pure unit tests that should
  avoid Prisma entirely.
- `mock-cookies.ts` provides a thin cookie mock for route-style tests.
- `principal.ts` builds principal-like objects.

These are correctly scoped as test-only helpers.

---

## 4. Smoke test review

### 4.1 What it actually tests
The smoke test asserts against `auth-matrix.ts`, specifically:
- SUPER_ADMIN has `dashboard.view` and `dashboard.manage`
- ADMIN has `dashboard.view` and can see platform stats
- CUSTOMER has `dashboard.view` but must not see other customers' transactions
  or staff audit logs
- RESELLER has `dashboard.view` but must not see other resellers' data
- STAFF must not see other customers' transactions, but may see staff audit logs

It does NOT call the real dashboard route. It does NOT call real Prisma queries.
It does NOT assert any production behavior.

### 4.2 Assessment
This is a legitimate and useful smoke test: it proves that `bun test` works, that
the matrix is coherent, and that the assertion framework is wired up. The report
should state clearly that this is a harness sanity check, not a security regression
test.

### 4.3 Limitations
The smoke test does not:
- Assert tenant scoping behavior against real queries
- Assert that a CUSTOMER cannot receive another customer's transaction in a real
  HTTP response
- Prove the dashboard fix works

So it is correct to call it a smoke test and incorrect to imply it is a
security regression test.

---

## 5. Failure-behavior test review

### 5.1 Design
The file contains one intentionally failing assertion:
```ts
expect(1 + 1).toBe(3)
```

This is a valid way to confirm that the runner detects failures.

### 5.2 Structural defect
The file lives in `tests/unit/`. That directory is inside the default discovery
path for `bun test`. So a default `bun test` run, which is the most likely CI
command, will always fail because of this file.

Verified behavior:
- `bun test` exits 1 because the failure-behavior test is discovered and fails.
- `bun test tests/unit/smoke.test.ts` exits 0.

This means the harness cannot currently be used in a naïve CI configuration
without the CI command explicitly excluding that file or without moving it.

### 5.3 Recommended fix (do not apply now; specify only)
One of:
- Move the failure-behavior test into a separate directory that is not in the
  default discovery path, e.g. `tests/_internal/failure-behavior.test.ts`, and
  run it only via an explicit command.
- Or, if the intent is to keep it as a permanent harness self-check, give CI an
  explicit whitelist/blacklist so normal runs stay green.

The owner's instruction says not to fix test files now, so this is recorded as a
required change rather than applied.

---

## 6. Execution evidence

- Smoke test passes consistently.
- Failure-behavior test fails consistently and causes suite exit 1.
- Default `bun test` discovers both files.
- No lockfile or dependency change occurred.

---

## 7. Harness readiness for future security testing

### 7.1 Ready
- Test runner: ready
- Basic fixture shape: ready
- Matrix concept: ready

### 7.2 Not yet ready
- No proven ability to run a realistic integration test that seeds Prisma rows
  and queries them through a route handler.
- No proven ability to test a Next.js route handler end-to-end.
- No coverage of the dashboard leak scenario.
- No coverage of auth/session/RBAC/payment/credential/webhook endpoints.

### 7.3 Distinction that matters
Smoke test success is not the same as security test readiness. The harness has the
building blocks, but it has not yet demonstrated that it can host a meaningful
security regression test against the dashboard or any other endpoint.

---

## 8. Status

**APPROVE WITH CONDITIONS**

Conditions:
1. Move or isolate the failure-behavior test so the default suite can be green in
   CI.
2. Do not describe the smoke test as a security regression test.
3. Before relying on the harness for security tests, demonstrate at least one
   integration-style test that seeds data and asserts scoping behavior.

---

G6 INDEPENDENT REVIEW COMPLETED — OWNER DECISION REQUIRED — NO NEW IMPLEMENTATION STARTED.
