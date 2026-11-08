# GATE 0 — TEST HARNESS PLAN

**Readiness verdict: NOT AVAILABLE.**
No runner, no config, no suite, no CI, no `test` script. Every existing script in
`scripts/` is a manual probe that prints output and asserts nothing.

This document defines what must exist before Gate 1 can claim "no regression",
and the test matrix that Gate 1 must satisfy.

---

## 1. Current state

| Artifact | Present | Note |
|---|---|---|
| `test` script | no | `package.json` has dev/build/start/lint/db:* only |
| Runner dependency | no | no vitest, jest, node:test harness, playwright |
| Config file | no | — |
| Test directory | no | — |
| CI workflow | no | no `.github/` |
| Manual probes | yes | `scripts/test-provision.js`, `test-delete.js`, `test-enterprise-settings.js`, `check-*.js`, `db-check.js` |

The manual probes require a live database, mutate it, and exit 0 regardless of
outcome. They must not be used as a gate.

---

## 2. Recommended harness (for approval at Gate 1)

**Runner: `bun test`.** Bun 1.4.4 is already the runtime, the test runner is
built in, and this adds **no dependency**, which keeps the Gate 1 diff purely
security-focused. Jest/Vitest would add packages and a transform pipeline for no
benefit here.

**Database: disposable SQLite per suite.**
`DATABASE_URL=file:$TMP/mvmp-<suite>.db`, schema created with
`prisma db push --skip-generate --accept-data-loss` **against the temp file
only**, deleted in teardown. This is a test-time operation and needs explicit
approval in Gate 1; it never touches a real database.

**Route-level tests.** Next route handlers call `cookies()` from
`next/headers`, which needs request context. Two options:

1. Test the pure layer (`tenant-scope`, `payment-webhook`, `credentials`,
   `crypto`, scope `where` builders) directly — high value, no framework
   friction.
2. For handlers, refactor in WP-01 so authorization takes a `Principal` derived
   by a wrapper, then call the handler with an injected principal. This is the
   same refactor the blueprint already requires; tests become possible as a
   side effect.

**Minimum Gate 1 harness deliverable (WP-17a-lite):**

- `test` and `test:watch` scripts.
- `tests/setup/db.ts` (temp SQLite + seed helpers).
- `tests/setup/factory.ts` (staff, reseller, customer, foreign customer).
- Six seed tests that must fail against current code and pass after the fix:
  TI-01, TI-02, TI-09, TI-10, AS-01, CR-03.
- A CI job (or a documented local command) that runs typecheck on changed files,
  the suite, and the build.

**Acceptance for the harness itself:** reverting the corresponding fix must make
the test fail. A test that passes both before and after is not a test.

---

## 3. Test matrix

Legend: **Setup** is the fixture state; **Expected** is the observable result.
Every test runs against the disposable DB, never production.

### 3.1 Tenant isolation

| ID | Scenario | Setup | Input | Expected | Risk | WP |
|---|---|---|---|---|---|---|
| TI-01 | Customer reads own dashboard | cust A + B, tx for each | `GET /api/dashboard` as A | response contains only A's counts; no B email | R-01 | WP-01 |
| TI-02 | Reseller dashboard limited to subtree | reseller R1, R2; customers under each | `GET /api/dashboard` as R1 | counts limited to R1 subtree; R2 data absent | R-01 | WP-01 |
| TI-03 | Staff dashboard is global | SUPER_ADMIN | `GET /api/dashboard` | platform totals present | regression | WP-01 |
| TI-04 | Customer list scoped | A, B | `GET /api/vpn-accounts` as A | only A's accounts; `total` = A's count | SEC-01 | WP-01 |
| TI-05 | Reseller list scoped | R1 subtree, R2 | `GET /api/customers?resellerId=<R2>` as R1 | empty page, not R2 rows | SEC-01 | WP-01 |
| TI-06 | Foreign VPN account read | A, B | `GET /api/vpn-accounts/<B>` as A | 404, body identical to missing id | SEC-04 | WP-01 |
| TI-07 | Foreign VPN account write | A, B | `PATCH /api/vpn-accounts/<B>` `{action:"suspend"}` as A | 404; B unchanged | G0-F-01 | WP-01 |
| TI-08 | Foreign VPN account delete | A, B | `DELETE /api/vpn-accounts/<B>` as A | 404; B still exists | G0-F-01 | WP-01 |
| TI-09 | Dashboard PII exclusion | A, B with paid tx | `GET /api/dashboard` as A | no `recentTransactions`, no audit logs, no server IPs | G0-F-02 | WP-01 |
| TI-10 | Unknown role fails closed | user with role `AFFILIATE` | any list endpoint | 403; zero rows | SEC-01 | WP-01 |

### 3.2 Authentication and session

| ID | Scenario | Setup | Input | Expected | Risk | WP |
|---|---|---|---|---|---|---|
| AS-01 | Token not stored in plaintext | login as A | inspect `Session` row | `token` matches `sha256:<hex>`, not the cookie value | SEC-12 | WP-02 |
| AS-02 | Expired session rejected | session `expiresAt` in past | request with cookie | 401 | SEC-12 | WP-02 |
| AS-03 | Revoked session rejected | `revokedAt` set | request with cookie | 401 | SEC-12 | WP-02 |
| AS-04 | Rotation invalidates old token | login, rotate | old cookie | 401 on old, 200 on new | R-08 | WP-02 |
| AS-05 | Failed login audited | A exists | wrong password ×3 | audit rows for each failure; response generic | NEW-11 | WP-03 |
| AS-06 | Login throttled | A exists | 10 wrong passwords in 1 min | 429 after threshold | SEC-07 | WP-03 |
| AS-07 | Unknown e-mail timing | — | login with unknown e-mail | bcrypt.compare still executed (constant-ish time) | NEW-11 | WP-03 |
| AS-08 | OTP not returned | A with MFA | `POST /api/security/otp/request` | response has no `mockOtp` in any NODE_ENV | SEC-05 | WP-03 |
| AS-09 | CSRF / origin check | signed-in A | `POST` with foreign `Origin` | 403 | SEC-11 | WP-15 |

### 3.3 Payment

| ID | Scenario | Setup | Input | Expected | Risk | WP |
|---|---|---|---|---|---|---|
| PY-01 | Invalid signature rejected | payment PENDING | callback, bad signature | 401; payment still PENDING | SEC-02 | WP-04 |
| PY-02 | Unconfigured provider rejected | no secret | callback | 503; no state change | SEC-02 | WP-04 |
| PY-03 | Amount mismatch rejected | PENDING, amount 100000 | callback 99000 | 400; still PENDING | NEW-01 | WP-04 |
| PY-04 | Currency mismatch rejected | IDR | callback USD | 400; still PENDING | NEW-01 | WP-04 |
| PY-05 | Amount absent rejected | PENDING | callback without amount | 400 | NEW-01 | WP-04 |
| PY-06 | Duplicate PAID idempotent | PAID | same callback twice | one transition, one audit row | R-05 | WP-04 |
| PY-07 | Parallel PAID | PENDING | 10 concurrent callbacks | exactly one PAID transition, one event row | R-05 | WP-04 |
| PY-08 | Unknown status recorded, not silently accepted | PENDING | status `DENIED` | event stored; response not 200; payment PENDING | G0-F-04 | WP-04 |
| PY-09 | Conflicting status after PAID | PAID | `EXPIRED` event | 409; conflict logged; payment stays PAID | R-05 | WP-04 |
| PY-10 | Duplicate reference cannot settle wrong invoice | two payments same ref | callback for one | unique constraint rejects the second at write time | DB-05 | WP-04 |
| PY-11 | Gateway creates Payment row | PENDING tx, no payment | `POST /create-gateway` | Payment PENDING with unique reference exists | R-04 | WP-05 |
| PY-12 | Adapter failure leaves no orphan | provider 500 | `POST /create-gateway` | no PAID/pending orphan; tx unchanged | R-04 | WP-05 |
| PY-13 | Mock URL impossible in production | `NODE_ENV=production`, live mode | `POST /create-gateway` | real provider URL or explicit 501; never `sandbox.com` | R-07 | WP-05 |
| PY-14 | Approval atomic | PENDING payment | approve + provisioning fails | whole operation rolls back or is retried from outbox | API-05 | WP-05 |
| PY-15 | Sub-unit mismatch rejected | amount 100000 | callback 100000.4 | 400 | G0-F-04 | WP-04 |

### 3.4 Credential

| ID | Scenario | Setup | Input | Expected | Risk | WP |
|---|---|---|---|---|---|---|
| CR-01 | Encrypt/decrypt roundtrip | key set | secret `S` | `decrypt(encrypt(S)) === S` | SEC-03 | WP-07 |
| CR-02 | AAD mismatch rejected | two rows | decrypt row A ciphertext with row B context | null | R-02 | WP-07 |
| CR-03 | Ciphertext swap rejected | rows A, B | copy A ciphertext into B; reveal B | null; error audited | R-02 | WP-07 |
| CR-04 | Tampered tag rejected | valid ciphertext | flip one hex char in tag | null | SEC-03 | WP-07 |
| CR-05 | Unknown envelope version rejected | `v9:...` | decrypt | null (no Base64 fallback) | G0-F-03 | WP-07 |
| CR-06 | Rotation preserves plaintext | rows under key1 | rotate to key2 | all rows decrypt to same plaintext | R-02 | WP-07 |
| CR-07 | Dual-read window | rows under key1 | decrypt with keyring [key2,key1] | success; `keyVersion` updated on rewrite | R-02 | WP-07 |
| CR-08 | No secret in response or log | account with credential | `GET /api/vpn-accounts/<id>` | body has no `secretEncrypted`; logs contain no plaintext | SEC-03 | WP-07 |
| CR-09 | Reveal audited | account | reveal action | `CREDENTIAL_REVEALED` audit row | R-03 | WP-07 |
| CR-10 | Production requires key | `NODE_ENV=production`, key unset | encrypt | throws; no row written | G0-F-03 | WP-07 |

### 3.5 Operations

| ID | Scenario | Setup | Input | Expected | Risk | WP |
|---|---|---|---|---|---|---|
| OP-01 | Simulator disabled in production | `NODE_ENV=production` | `POST /api/simulator/tick` | 404 | NEW-07 | WP-12 |
| OP-02 | Simulator writes nothing in test | non-prod | tick | jobs untouched | NEW-07 | WP-12 |
| OP-03 | Worker idempotent | job QUEUED | deliver same job twice | one execution, one effect | ARCH-V1 | WP-11 |
| OP-04 | AI kill switch | flag on | chat request | 503 before provider call | NEW-06 | WP-13 |
| OP-05 | Realtime broadcast scoped | two tenants | emit tenant A event | only A's sockets receive | SEC-10 | WP-10 |
| OP-06 | Realtime `/emit` requires auth | — | POST without token | 401 | SEC-10 | WP-10 |
| OP-07 | Rate limit shared across instances | two app instances | 20 requests | limit enforced globally (Redis) | SEC-07 | WP-09 |
| OP-08 | Audit retention prunes | old rows | retention job | only rows older than N days removed | SEC-14 | WP-15 |

---

## 4. Gate 1 minimum set

The first Gate 1 wave (WP-17a-lite + WP-01a) must ship these before touching
authorization:

| Priority | Tests | Why |
|---|---|---|
| Must | TI-01, TI-02, TI-09, TI-10 | proves R-01 is closed and scoping is real |
| Must | TI-06, TI-07, TI-08 | proves read and write symmetry |
| Must | AS-01, AS-03 | proves the session change is correct |
| Must | CR-02, CR-03, CR-05 | proves AAD and envelope rejection |
| Should | TI-04, TI-05 | list scoping regression |
| Should | PY-01, PY-03, PY-06 | payment regression guard while WP-01 is in review |

---

## 5. Testability gaps to fix in WP-01

1. **No principal injection.** 137 `getSessionUser()` call sites make handlers
   untestable without mocking `next/headers`. WP-01's wrapper solves this; tests
   should target the wrapper and the scope helpers first.
2. **No factory.** Creating a reseller tree by hand in each test is fragile; the
   setup module must build staff/reseller/customer trees deterministically.
3. **No clock control.** Session expiry tests need injectable `now`; add a clock
   parameter to `createSession`/`getSessionUser` rather than sleeping.
4. **No key injection.** `crypto.ts` caches the key at module load; tests need
   `resetKeyCacheForTests()` or a key provider argument.

---

## 6. Acceptance criteria for the harness

- `bun test` exits non-zero on failure and is wired into the documented check
  command.
- Each Must test fails when its fix is reverted (verified manually once).
- No test opens a network socket, sends email/WhatsApp, or touches a
  non-temporary database.
- Suite runtime under 60 s locally.
- Coverage on `src/lib/tenant-scope.ts`, `src/lib/credentials.ts`,
  `src/lib/crypto.ts`, `src/lib/payment-webhook.ts` ≥ 90% statements.
