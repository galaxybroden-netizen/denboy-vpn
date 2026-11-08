# GATE 0 — EXECUTIVE REPORT

**Project:** MVMP (Multi VPN Management Panel)
**Gate:** G4 / Gate 0 — Preparation & Baseline
**Date:** 2026-11-07
**Mode:** Controlled read-only audit + test preparation
**Blueprint:** `docs/project-analysis/16_SECURITY_REMEDIATION_BLUEPRINT.md`
**Independent audit:** `docs/project-analysis/15_INDEPENDENT_AUDIT_VALIDATION.md`

---

## 1. Decision

**PASS WITH CONDITIONS.**

Gate 0 completed every verification that can be performed without changing the
system. The P0 wave is real: tenant scoping, webhook signature/amount
verification, AES-GCM credential storage, and gateway ownership checks exist in
the current tree and were exercised by reading the actual control flow, not by
trusting the blueprint.

Gate 1 may start, but only on the packages listed in §6. Two conditions are
mandatory and one work package is blocked:

| Condition | Effect |
|---|---|
| C1 — A minimal test runner must exist before WP-01 edits 90+ route handlers | WP-01 cannot start before WP-17a-lite |
| C2 — Session token hashing must be shipped with dual-read and no schema change | WP-02 can start without WP-16a |
| C3 — WP-16a (database migration baseline) is **BLOCKED** | No migration work until the owner provides a database instance, a verified backup, and a restore rehearsal |

---

## 2. What was verified, and how

| Area | Method | Result |
|---|---|---|
| Seven P0 implementation units | Read the library, every route in the scoped set, and the failure branches | 5 VERIFIED, 2 PARTIAL, 0 FAILED |
| Residual R-01, R-02, R-05, R-07 | Read code + data flow + reproduce logic on paper | All four confirmed OPEN |
| Project health | `tsc --noEmit`, `eslint .`, `next build`, `prisma validate`, `docker compose config`, `bun audit` | 1 PASS, 5 FAIL, 3 NOT AVAILABLE |
| Database readiness | Schema comparison, migration directory, DB file, backup/restore scripts | NOT READY |
| Test harness | Search for runner, config, test directories, scripts | NOT AVAILABLE (no runner, no tests, no CI) |

No application source, schema, configuration, dependency, or data was modified.
The only files created are the eight documents in this directory.

---

## 3. The four facts that change the plan

### 3.1 R-01 is worse than "aggregate leakage"

`src/app/api/dashboard/route.ts` grants access on `dashboard.view`, a permission
held by `CUSTOMER` and `RESELLER` (`src/lib/auth.ts:59-64`). The response then
returns, unscoped:

- `db.customer.count()` (line 39), `db.reseller.count()` (line 40), `db.transaction.count()` (line 41)
- platform revenue `db.transaction.aggregate({ where: { status: "PAID" } })`
- `recentTransactions` (line 52) including **other customers' name, email, customer code**
- `recentAuditLogs` (line 45) including staff names and roles
- `serverMetrics` with server names and public IPs

This is not an aggregate inference issue; it is direct cross-tenant PII
disclosure to every logged-in customer. It must be treated as **P0**, not as a
P1 hardening item. Recommendation: elevate R-01 to the first task of WP-01.

### 3.2 OTP is still returned to the caller in every environment

`src/lib/otp.ts:185` returns `mockOtp: plaintext` unconditionally. The comment
claims "In production: remove this line", but no environment branch exists, and
`src/app/api/security/otp/request/route.ts:57` forwards it with the comment
`// undefined in production`. It is never undefined. Any attacker who can reach
an authenticated session (or replay a password) receives the second factor in
the same response. Two-factor authentication is currently decorative.

### 3.3 Write-side tenant scoping is missing where the read side has it

The P0 wave added scope checks to the read paths. These write handlers check
only a static role permission and then operate on a client-supplied `id`:

| Handler | Permission gate | Tenant scope |
|---|---|---|
| `vpn-accounts/[id]/route.ts` PATCH/DELETE | `vpn_accounts.manage` | none |
| `customers/[id]/route.ts` PATCH/DELETE | `customers.manage` | none |
| `transactions/[id]/route.ts` PATCH | `transactions.manage` | none |

Today this is not exploitable, because `CUSTOMER` and `RESELLER` do not hold
those permissions (`auth.ts:59-64`). It becomes exploitable the moment WP-01
moves authorization to the database matrix and an operator grants
`vpn_accounts.manage` to `RESELLER` — a grant the RBAC UI explicitly permits.
Recorded as **G0-F-01**, must be closed in the same change as the RBAC switch.

### 3.4 The platform cannot currently build or deploy

- `next build`: compiles in 10.5 s, then fails prerendering `/`
  (`useSearchParams()` without a Suspense boundary). Exit 1.
- `docker compose config`: fails interpolation on `AI_ENCRYPTION_KEY`,
  `MVMP_DB_PASSWORD`, `MVMP_REDIS_PASSWORD` (no env file present). Separately,
  `build.context: ..` resolves to `deploy/`, where no Dockerfile exists
  (`Dockerfile` is at the repository root).
- `bun audit`: **55 vulnerabilities, 4 critical**, all four in Next.js 16.1.1
  (unauthenticated RCE advisories fixed in 16.3.3 / 16.4.0), plus 24 high.

None of these is caused by Gate 0, but they mean "deploy and test in
production-like conditions" is not available today.

---

## 4. Residual findings status

| ID | Finding | Status after verification | Blueprint WP |
|---|---|---|---|
| R-01 | Dashboard cross-tenant disclosure | **CONFIRMED, escalated to P0** | WP-01 |
| R-02 | Ciphertext not bound to row; no AAD, no key id | **CONFIRMED** | WP-07 |
| R-05 | No durable webhook event store, dedupe depends on status | **CONFIRMED** | WP-04 |
| R-07 | Gateway URL is a mock; Payment not created when absent | **CONFIRMED** | WP-05 |

New findings from this gate (details in `02_RESIDUAL_FINDINGS_VERIFICATION.md`):

| ID | Finding | Severity |
|---|---|---|
| G0-F-01 | Write handlers lack tenant scope (latent, activated by DB RBAC) | HIGH |
| G0-F-02 | Dashboard exposes recent transaction PII and audit logs, not only counts | CRITICAL (elevates R-01) |
| G0-F-03 | `decrypt()` accepts any non-`v1:` string as unauthenticated Base64; dev key derived from `DATABASE_URL` | HIGH |
| G0-F-04 | Webhook acknowledges unknown/conflicting statuses with HTTP 200, suppressing provider retries; amount compared with `Math.round` | MEDIUM |
| G0-F-05 | Four critical Next.js RCE advisories in the pinned version | CRITICAL (dependency) |
| G0-F-06 | `payment.providers` stored `isSensitive: false`, returned by `/api/settings/system` | HIGH |
| G0-F-07 | `mockOtp` returned in production | CRITICAL |
| G0-F-08 | No local `.env`, no database file: runtime/DB verification impossible on this machine | ENVIRONMENT |

---

## 5. Baseline snapshot

| Check | Status | Evidence |
|---|---|---|
| Typecheck | **FAIL** | 43 errors, exit 1; 17 in `src/app/api/chat/route.ts`, 10 in `scripts/seed.ts` |
| Lint | **FAIL** | 33 errors, exit 1 (`react-hooks/set-state-in-effect` dominant) |
| Unit tests | **NOT AVAILABLE** | no vitest/jest config, no test directory, no `test` script |
| Integration tests | **NOT AVAILABLE** | same |
| E2E | **NOT AVAILABLE** | no Playwright/Cypress config |
| Production build | **FAIL** | compiles; prerender `/` fails on `useSearchParams()` |
| Prisma validation | **PASS (conditional)** | both schemas valid; requires `DATABASE_URL` in env, absent locally |
| Docker Compose config | **FAIL** | missing required env vars; broken build context |
| Dependency audit | **FAIL** | 55 vulnerabilities (4 critical, 24 high, 23 moderate, 4 low) |

`next.config.ts:7` still sets `ignoreBuildErrors: true`, so the TypeScript
failures do not stop the build — they are invisible to CI and to the deploy.

---

## 6. What Gate 1 may and may not start

| Work package | Verdict | Precondition |
|---|---|---|
| WP-17a-lite (test runner + 6 seed tests) | **GO** | none |
| WP-01a (dashboard scoping + R-01/G0-F-02) | **GO** | WP-17a-lite |
| WP-01b (tenant scope on write handlers, G0-F-01) | **GO** | WP-01a |
| WP-02 (session token hashing, dual-read) | **GO WITH CONDITION** | no schema change; C2 |
| WP-16a-1 (compose build context, realtime port, schema parity) | **GO WITH CONDITION** | code-only changes; no migration |
| WP-16a-2 (migration baseline, `prisma migrate`) | **BLOCKED** | DB instance + verified backup + restore rehearsal |
| WP-03 (OTP/login) | **HOLD** | depends on WP-02 session semantics |
| WP-04/05/06/07 (payment, vault) | **HOLD** | depends on WP-01 guard |

Rationale and file-level detail: `06_GATE1_IMPLEMENTATION_READINESS.md`.

---

## 7. Counts required by the gate

| Metric | Count |
|---|---|
| Gate 0 status | PASS WITH CONDITIONS |
| Checks PASS | 1 (Prisma validate) |
| Checks FAIL | 5 (typecheck, lint, build, compose config, dependency audit) |
| Checks BLOCKED / NOT AVAILABLE | 3 (unit, integration, E2E) |
| P0 units VERIFIED | 5 |
| P0 units PARTIAL | 2 |
| P0 units FAILED | 0 |
| Residual findings still open | 4 requested (R-01, R-02, R-05, R-07) + 8 new (G0-F-01…08) |
| Baseline tests passed | 0 |
| Baseline tests failed | 0 (no tests exist) |
| Blockers | WP-16a-2 migration baseline; no DB/env on this host; critical Next.js advisories; build broken at prerender |

---

## 8. Immediate recommendation

1. **Do not deploy the current tree.** It cannot complete `next build`, and the
   pinned Next.js version carries four critical RCE advisories.
2. **Treat R-01 as P0.** Every customer account can read other customers'
   names, emails, and invoice amounts through `/api/dashboard`.
3. **Fix OTP before any 2FA claim.** Returning the OTP in the response makes the
   second factor worthless.
4. **Start Gate 1 with the test runner, then the dashboard, then the write-side
   scope.** Those three are independent of the blocked migration work.
5. **Obtain from the owner, before WP-16a-2:** the target database engine and
   connection method, a recent backup, and an approved window for a restore
   rehearsal on a non-production copy.

---

**GATE 0 COMPLETED — WAITING FOR OWNER APPROVAL.**

No Gate 1 implementation may begin before approval is given.
