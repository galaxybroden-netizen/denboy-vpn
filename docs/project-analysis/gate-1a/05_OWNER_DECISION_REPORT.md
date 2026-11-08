# GATE 1A / R-01 / NEXT.JS SECURITY — OWNER DECISION REPORT

**Date:** 2026-02-28  
**Status:** GATE 1A COMPLETED — R-01 SPECIFICATION READY FOR REVIEW — NEXT.JS UPGRADE PLAN SEPARATED — WAITING FOR OWNER APPROVAL.

---

## 1. Workstream status summary

| Workstream | Status | Notes |
|------------|--------|-------|
| Gate 1A Test Harness | PASS WITH CONDITIONS | Minimal `bun test` harness created; no dependency added; smoke tests pass; failure behavior verified; no production code changed |
| R-01 Dashboard Leak Specification | READY FOR OWNER REVIEW | Root cause and remediation fully specified in `docs/project-analysis/gate-1b/00_R01_DASHBOARD_REMEDIATION_SPEC.md`. No code changed. Awaiting owner approval of the spec. |
| Next.js Security Upgrade Plan | READY FOR OWNER REVIEW | Research complete; plan document created at `docs/project-analysis/nextjs-security-upgrade/00_NEXTJS_SECURITY_UPGRADE_PLAN.md`. No dependency upgraded. Awaiting separate owner approval. |

---

## 2. Gate 1A — Test Harness

### 2.1 What was created

- `tests/setup/db.ts` — disposable in-memory SQLite Prisma client
- `tests/setup/factory.ts` — user/reseller/customer/transaction/audit fixtures
- `tests/setup/auth-matrix.ts` — role/permission authority table for tests
- `tests/fixtures/roles.ts` — role constants
- `tests/fixtures/permissions.ts` — permission constants
- `tests/helpers/principal.ts` — principal simulation helpers
- `tests/helpers/mock-cookies.ts` — minimal Next.js context mock
- `tests/helpers/mock-db.ts` — light in-memory stub for pure unit tests
- `tests/unit/smoke.test.ts` — meaningful smoke test (passes)
- `tests/unit/failure-behavior.test.ts` — intentional failure (fails, exits 1)
- `docs/project-analysis/gate-1a/00…04.md` — reports and checklist

### 2.2 What was executed

- `bun test tests/unit/smoke.test.ts` — 5 pass, 0 fail, exit 0
- `bun test tests/unit/failure-behavior.test.ts` — 0 pass, 1 fail, exit 1
- `bun test tests/unit` — 5 pass, 1 fail, exit 1
- `bun test` (default discovery) — discovers and runs all tests under `tests/`, exits 1 when any test fails

### 2.3 Acceptance criteria met

- `bun test` executes successfully: yes
- Test discovery works: yes
- At least one meaningful smoke test passes: yes
- Failure behavior verified: yes (suite exits 1)
- No production business logic changed: yes
- No unnecessary dependency added: yes
- Existing P0 changes remain intact: yes
- Execution instructions documented: yes

### 2.4 Dependencies

None added. The harness uses only `bun test`, which is already present (Bun 1.4.4).

### 2.5 Production code changes

None.

### 2.6 Files modified

None.

### 2.7 Limitation

Coverage, snapshot, E2E, and real Postgres/Redis integration tests are out of scope.
The harness does not yet contain R-01-specific tests because R-01 is not implemented.

---

## 3. R-01 — Dashboard Leak Specification

### 3.1 Problem (from Gate 0)

`/api/dashboard` exposes `recentTransactions` with other customers' name, email,
and customer code, plus `recentAuditLogs` with staff name and role, to CUSTOMER
and RESELLER roles. This is the P0 leak.

### 3.2 Root cause identified

- Route: `src/app/api/dashboard/route.ts`
- Handler: `GET()` at line 10
- AuthN: `getSessionUser()` at line 18
- AuthZ: `hasPermission(user.role, "dashboard.view")` at line 25
- Queries: global aggregates and tenant-scoped rows fetched without any tenant
  filter:
  - `db.transaction.count()` (platform-wide count)
  - `db.transaction.findMany({ take:5, orderBy createdAt, include customer + payments })`
  - `db.auditLog.findMany({ take:5, orderBy createdAt, include user })`
  - `db.serverMetric.findMany(...)`

### 3.3 Exact exposed fields

- recentTransactions: customer.name, customer.email, customer.customerCode,
  payments[].id, payments[].provider, payments[].status, payments[].amount
- recentAuditLogs: user.name, user.role
- serverMetrics: per-server operational data

### 3.4 Roles affected

CUSTOMER (highest impact), RESELLER, STAFF (to review), ADMIN and SUPER_ADMIN
less affected.

### 3.5 What the specification provides

The complete specification is in
`docs/project-analysis/gate-1b/00_R01_DASHBOARD_REMEDIATION_SPEC.md` and
includes:
- Root cause with exact route, functions, queries, exposed fields, roles, and
  tenant boundaries
- Data classification (platform-wide, tenant-owned, staff-only, public)
- Proposed authorization matrix for SUPER_ADMIN, ADMIN, STAFF, RESELLER, CUSTOMER
- Tenant isolation design using existing `src/lib/tenant-scope.ts` utilities
- Response contract by role
- Regression test plan (10 tests)
- Implementation plan (files, functions, query changes, response changes,
  reuse of tenant-scope utilities, compatibility, rollback)
- Acceptance criteria
- Risk assessment

### 3.6 What was NOT done

No production code was changed. No dashboard query was modified. No RBAC change.
No database change. No frontend change.

### 3.7 Required owner decisions before implementation

1. Confirm the authorization matrix, especially STAFF and ADMIN visibility.
2. Confirm whether ADMIN should still see platform-wide recent transactions and
   audit logs.
3. Confirm frontend impact tolerance or agree to update the frontend.
4. Approve the regression test plan (section F of the spec).

---

## 4. Next.js Security Upgrade Plan

### 4.1 Why separate

Gate 0 identified four critical RCE advisories associated with the current Next.js
16.1.1 dependency. The owner directed this to be a separate workstream, not
combined with Gate 1A or R-01.

### 4.2 What was done

Research completed and documented in
`docs/project-analysis/nextjs-security-upgrade/00_NEXTJS_SECURITY_UPGRADE_PLAN.md`.
The document covers:
- Current dependency baseline (to be confirmed against lockfile)
- Security advisory mapping
- Recommended target version (to be confirmed against official advisories and
  release notes)
- Compatibility assessment
- Build and deployment impact
- Rollback plan

### 4.3 What was NOT done

No `package.json` change. No lockfile change. No dependency upgrade. No build
verification performed.

### 4.4 Required owner decision

Separate approval to proceed with the Next.js upgrade, after the owner has
reviewed the plan and confirmed the target version and any required code changes.

---

## 5. Files created

### Gate 1A
- `docs/project-analysis/gate-1a/00_GATE1A_EXECUTIVE_REPORT.md`
- `docs/project-analysis/gate-1a/01_TEST_HARNESS_ARCHITECTURE.md`
- `docs/project-analysis/gate-1a/02_TEST_EXECUTION_RESULTS.md`
- `docs/project-analysis/gate-1a/03_CHANGED_FILES.md`
- `docs/project-analysis/gate-1a/04_GATE1A_ACCEPTANCE_CHECKLIST.md`
- `tests/setup/db.ts`
- `tests/setup/factory.ts`
- `tests/setup/auth-matrix.ts`
- `tests/fixtures/roles.ts`
- `tests/fixtures/permissions.ts`
- `tests/helpers/principal.ts`
- `tests/helpers/mock-cookies.ts`
- `tests/helpers/mock-db.ts`
- `tests/unit/smoke.test.ts`
- `tests/unit/failure-behavior.test.ts`

### R-01 specification
- `docs/project-analysis/gate-1b/00_R01_DASHBOARD_REMEDIATION_SPEC.md`

### Next.js upgrade plan
- `docs/project-analysis/nextjs-security-upgrade/00_NEXTJS_SECURITY_UPGRADE_PLAN.md`

---

## 6. Files modified

None.

---

## 7. Production code changes

None.

---

## 8. Test results

- Smoke test: 5/5 pass
- Failure-behavior test: 0/1 pass (intentionally fails; suite exits 1)
- Full suite: 5 pass, 1 fail, exit 1
- No real Postgres/Redis tests executed (out of scope)

---

## 9. Dependency changes

None.

---

## 10. Existing P0 preservation

No file touched. Existing P0 changes preserved.

---

## 11. Remaining risks

- R-01 is specified but not implemented; the leak still exists until the spec is
  approved and the fix is implemented and tested.
- Next.js upgrade is researched but not executed; advisories remain open until
  upgraded and verified.
- The test harness is minimal; it does not yet cover the dashboard leak directly.

---

## 12. Owner decisions required

1. Approve the R-01 specification as-is, or request changes.
2. Approve implementation of R-01 after spec approval.
3. Approve the Next.js security upgrade plan and target version as a separate
   workstream.
4. Decide whether to proceed with Gate 1A test expansion (coverage, integration
   tests) as a later step.

---

GATE 1A COMPLETED — R-01 SPECIFICATION READY FOR REVIEW — NEXT.JS UPGRADE PLAN SEPARATED — WAITING FOR OWNER APPROVAL.
