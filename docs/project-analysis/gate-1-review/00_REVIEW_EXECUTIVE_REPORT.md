# G6 — INDEPENDENT REVIEW EXECUTIVE REPORT

**Reviewer role:** Independent technical reviewer (read-only)
**Date:** 2026-02-28
**Scope:** Gate 1A test harness, R-01 dashboard spec, Next.js upgrade plan
**Implementation permission:** NOT GRANTED per G6 stop condition

---

## 1. Headline decision

| Workstream | Review status | Implementation permission |
|---|---|---|
| Gate 1A Test Harness | APPROVE WITH CONDITIONS | NOT YET (conditions: remove negative test from default discovery path) |
| R-01 Dashboard Specification | APPROVE WITH CONDITIONS | NO — owner must still approve after this review |
| Next.js Security Upgrade Plan | APPROVE WITH CONDITIONS | NO — owner must still approve target version after advisory confirmation |

Overall: **APPROVE WITH CONDITIONS** across all three, with no implementation started.

---

## 2. What the review checked

- All Gate 1A documentation (00–05) and related test files
- All R-01 specification content
- All Next.js upgrade plan content
- Actual source: `src/app/api/dashboard/route.ts`, `src/lib/auth.ts`,
  `src/lib/tenant-scope.ts`, `src/lib/rbac.ts`
- Schema: `prisma/schema.prisma` (User, Customer, Reseller, Transaction,
  AuditLog, ServerMetric, Notification, VpnAccount, Role, Permission,
  RolePermission, UserPermission, UserRole)
- Configuration: `package.json`, `bun.lock`, `bun.lockb` absence, `tsconfig.json`,
  `next.config.ts`
- Real dependency versions via `bun pm ls`
- Advisory evidence via GitHub advisory pages and OSV for the four GHSA IDs in
  the plan

Every claim in the prior reports was treated as unproven and re-checked against
the artifacts above.

---

## 3. Key findings

### 3.1 Gate 1A — mostly sound, one structural issue

- Bun test is real and used correctly. Verified by running `bun test`.
- Smoke test is coherent: it asserts the test authority matrix, not production
  behavior, and that is correctly stated. It is NOT a security regression test —
  the report should say so even more explicitly.
- Failure-behavior test is correctly designed to fail, and the suite correctly
  exits non-zero when it is present. Verified by running `bun test` with and
  without that file.
- One real defect: the failure-behavior test lives in `tests/unit/`, which is
  inside the default discovery path. That means a normal `bun test` run (the
  likely CI command) will always be red until that file is moved. This is a
  structural problem for the stated CI model.
- Harness is NOT yet ready for most security testing. It has fixtures and a
  matrix, but it has not been exercised against a real scoped route, a real
  Prisma query, or a real Next.js handler. Smoke passing is a harness sanity
  check, not a coverage statement.

### 3.2 R-01 spec — substantially correct, one inconsistency and one gap

- Root cause is correctly identified and matches `src/app/api/dashboard/route.ts`.
- Authorization matrix correctly uses only the five real roles.
- One inconsistency: the spec says STAFF sees no platform stats, but the matrix
  later lists STAFF with `canSeePlatformStats: true`. This must be resolved
  before implementation because it changes the STAFF response contract.
- One gap: the spec does not yet map the exact Prisma query fragments to the
  exact DB models/relations in a way that makes the test plan unambiguous. That
  is acceptable at spec stage, but it should be tightened before code is written.
- The spec does not yet address the STAFF-ROLE mismatch between
  `tenant-scope.ts` (which treats SUPER_ADMIN, ADMIN, OPERATOR, FINANCE,
  CUSTOMER_SERVICE as `all`) and the dashboard spec (which talks about STAFF as
  if it were a distinct non-`all` role). The owner must confirm whether STAFF
  is intended to be a staff-like role that sees platform totals or not.

### 3.3 Next.js plan — sound skeleton, not yet a decision-ready target

- The plan correctly separates the upgrade from other workstreams.
- Advisory evidence for the four GHSA IDs is real and was verified against GitHub
  advisory pages:
  - GHSA-p293-qw3h-jr36: Windows-hosted RCE; affected `>= 16.0 < 16.3.3`;
    patched in `16.3.3`
  - GHSA-2xp9-vwfh-vxw4: AVIF image optimization RCE; affected `>= 16.0.0 < 16.3.3`;
    patched in `16.3.3`
  - GHSA-2464-fhr4-w9xw: SVG image optimization RCE; affected `>= 16.0.0 < 16.4.1`;
    patched in `16.4.1`
  - GHSA-673q-mjm6-r5xr: `use cache` typed arrays RCE; affected `>= 16.0.0 < 16.4.1`;
    patched in `16.4.1`
- The project currently runs Next.js `16.1.1`, React `19.3.1`, and sharp
  `0.34.5` (verified via `bun pm ls`).
- The plan does not yet state a single recommended target version. Based on the
  advisory evidence, the smallest version that addresses all four advisories is
  `16.4.1`, but the plan must still assess whether `16.4.1` is acceptable given
  React compatibility, project feature usage, and breaking changes.

---

## 4. Evidence highlights

- Dashboard route: `src/app/api/dashboard/route.ts` runs `hasPermission(user.role,
  "dashboard.view")`, then fetches `db.customer.count()`, `db.reseller.count()`,
  `db.transaction.count()`, `db.transaction.findMany(... include customer +
  payments)`, `db.auditLog.findMany(... include user)`, and
  `db.serverMetric.findMany(... include server)` with no tenant filter.
- Roles in schema: `UserRole` enum contains SUPER_ADMIN, ADMIN, OPERATOR,
  FINANCE, CUSTOMER_SERVICE, RESELLER, CUSTOMER. The dashboard spec only uses the
  five-role model, which matches `ROLE_PERMISSIONS` but not the full enum.
- `tenant-scope.ts` treats `STAFF_ROLES` as `{ kind: "all" }`, and that set
  includes OPERATOR, FINANCE, CUSTOMER_SERVICE but NOT a role literally named
  `STAFF`. This is a naming mismatch the owner must clarify.
- Serialization: `serialize()` in `utils-mvmp.ts` only converts BigInt/Date to
  JSON-safe values; it does not strip relations or PII. This confirms the spec's
  concern that Prisma includes can leak fields.
- Lockfile: `bun.lock` exists; the prior report mentioned confirming against it.
  It exists and is usable; the review confirms the current installed versions via
  `bun pm ls`.

---

## 5. Conditions to clear before implementation

### Gate 1A
- Move `tests/unit/failure-behavior.test.ts` out of the default discovery path,
  or gate it behind an explicit script, so normal CI is not always red.

### R-01
- Resolve the STAFF platform-stats inconsistency in the matrix.
- Confirm whether STAFF is intended to be `all` or tenant-scoped in the dashboard
  contract.
- Confirm the exact role/permission boundary between the five-role dashboard model
  and the seven-value `UserRole` enum.

### Next.js
- Confirm the target version against advisory evidence and release notes.
- Assess whether the project uses image optimization and `use cache` enough to
  make the four advisories directly actionable.
- Assess React compatibility and any code changes needed at the target version.

---

## 6. Stop condition honored

No production code, test files, `package.json`, lockfile, schema, or
configuration was modified during this review. No implementation started. No
migration run. No deployment.

---

G6 INDEPENDENT REVIEW COMPLETED — OWNER DECISION REQUIRED — NO NEW IMPLEMENTATION STARTED.
