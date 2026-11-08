# GATE 0 — DONE-P0 VERIFICATION

**Scope:** independent verification of the seven P0 implementation units claimed
complete in blueprint §2.
**Method:** read the library, every route in the affected set, and every failure
branch; trace what happens on invalid input, foreign resource, and replay.
**Constraint:** no code was modified and no runtime test was executed (there is
no database or `.env` on this host — see G0-F-08).

> Blueprint tagging note: six IDs carry `DONE-P0` (SEC-02, SEC-03, SEC-04,
> NEW-01, NEW-02, API-01) and SEC-01 is `PARTIAL` with seven scoped endpoints.
> Gate 0 therefore verifies seven **implementation units**, listed below.

---

## Summary

| Unit | P0 ID | Status | Runtime |
|---|---|---|---|
| P0-01 Tenant scope resolver | SEC-01 | **VERIFIED** | NOT EXECUTED |
| P0-02 Scope inside list queries | SEC-01 | **VERIFIED** | NOT EXECUTED |
| P0-03 Detail ownership → 404 | SEC-04 | **VERIFIED** | NOT EXECUTED |
| P0-04 Webhook signature verification | SEC-02 | **VERIFIED** | NOT EXECUTED |
| P0-05 Webhook amount & currency equality | NEW-01 | **PARTIAL** | NOT EXECUTED |
| P0-06 Gateway transaction ownership | NEW-02 / API-01 | **VERIFIED** | NOT EXECUTED |
| P0-07 Credential encryption & masking | SEC-03 | **PARTIAL** | NOT EXECUTED |

Counts: **5 VERIFIED, 2 PARTIAL, 0 FAILED.**
No unit has committed test evidence; all statuses are static verification with
the failure path traced. Runtime behaviour remains UNVERIFIED until a test runner
and a disposable database exist.

---

## P0-01 — Tenant scope resolver

| Field | Detail |
|---|---|
| **Files** | `src/lib/tenant-scope.ts` |
| **Implementation** | `resolveTenantScope(user)` maps a session user to `all` (staff), `reseller` (own subtree), `customer` (self), or `none`. Staff roles: SUPER_ADMIN, ADMIN, OPERATOR, FINANCE, CUSTOMER_SERVICE. Unknown role returns `none`. |
| **Evidence** | L24-70 resolver; L30-36 `STAFF_ROLES`; L46-52 customer lookup by `userId`; L54-68 reseller BFS with `MAX_HIERARCHY_DEPTH = 5`; L70 fail-closed `none`. |
| **Failure path traced** | Customer row missing → `none`. Reseller row missing → `none`. Unknown role (e.g. `AFFILIATE`) → `none`. A `none` scope yields `{ id: { in: [] } }` from every `*ScopeWhere` helper, so a caller that forgets to check `kind` still reads nothing. This is the correct fail-closed shape. |
| **Test** | No committed test. Ad-hoc P0 verification (reported 15 scope-logic assertions) was not retained in the repository and cannot be reproduced. |
| **Status** | **VERIFIED** (static) |
| **Residual** | R-09 confirmed: up to 6 sequential queries per request (1 identity + 5 BFS levels), no cache. Deeper-than-5 reseller trees are silently truncated — safe (under-grant) but functionally wrong. |

---

## P0-02 — Scope inside list queries

| Field | Detail |
|---|---|
| **Files** | `src/app/api/customers/route.ts`, `src/app/api/transactions/route.ts`, `src/app/api/vpn-accounts/route.ts` |
| **Implementation** | Each list handler builds client filters in `where`, then appends the scope fragment under `where.AND`. Both `count()` and `findMany()` receive the same `where`. |
| **Evidence** | `customers/route.ts:51-61`; `transactions/route.ts:46-56`; `vpn-accounts/route.ts:47-57`. In all three, `scope.kind === "none"` returns 403 before querying. |
| **Failure path traced** | Because the scope is appended to `AND`, a client-supplied `?resellerId=` or `?customerId=` cannot widen the result: Prisma intersects `where.resellerId` with `AND: [{ resellerId: { in: [...] } }]`. A `CUSTOMER` passing `?customerId=<other>` gets an empty page, not another tenant's rows. |
| **Test** | No committed test. |
| **Status** | **VERIFIED** (static) |
| **Residual** | Total counts are scoped, but `/api/dashboard` is not (R-01). Pagination `total` is correct per tenant. |

---

## P0-03 — Detail ownership returns 404

| Field | Detail |
|---|---|
| **Files** | `src/app/api/vpn-accounts/[id]/route.ts:76-83`; `src/app/api/customers/[id]/route.ts:51-57`; `src/app/api/transactions/[id]/route.ts:67-73` |
| **Implementation** | The row is loaded by id, then `canAccessVpnAccount` / `canAccessCustomer` / `canAccessTransaction` is evaluated. A failure returns `404 NOT_FOUND`, not 403. |
| **Failure path traced** | Foreign id → 404 with the same body as a genuinely missing id, so existence is not confirmed. `canAccessVpnAccount` reads `account.customer.resellerId` from the included relation; if the relation is missing it returns `false` rather than granting. |
| **Test** | No committed test. |
| **Status** | **VERIFIED** (static) |
| **Residual** | **G0-F-01:** the same three files' PATCH/DELETE handlers do **not** call the scope helpers — see §"New finding". `vpn-accounts/[id]` GET also decrypts and returns full credentials with no dedicated audit event (R-03). |

---

## P0-04 — Webhook signature verification

| Field | Detail |
|---|---|
| **Files** | `src/lib/payment-webhook.ts`, `src/app/api/payments/webhook/[provider]/route.ts` |
| **Implementation** | Provider allow-list; per-provider secret from `payment.providers`; timing-safe comparison; unconfigured provider rejects with 503 before any DB write. |
| **Evidence** | `payment-webhook.ts:36-40` constant-time compare; `:62-95` Xendit callback token and Midtrans `sha512(order_id+status_code+gross_amount+serverKey)`; `:97-106` DOKU/iPaymu HMAC-SHA256 over the raw body; `readSecret` returns null for blank/absent secret. Route `:62-80` maps `PROVIDER_NOT_CONFIGURED` → 503, other failures → 401, before `db.payment.findFirst`. |
| **Failure path traced** | Missing header → 401. Wrong secret → 401. Unknown provider → 400. Malformed JSON → 400. Unconfigured gateway → 503. No code path reaches the update block without `verdict.ok`. Raw body is read with `req.text()` before JSON parsing, so HMAC covers exactly the bytes the provider signed. |
| **Test** | No committed test. Ad-hoc run (reported 9 signature + 12 route assertions) not retained. |
| **Status** | **VERIFIED** (static) |
| **Residual** | Secrets are read from a setting row stored with `isSensitive: false` and returned by `/api/settings/system` (G0-F-06 / SEC-08). A compromised admin session yields the signing keys. No IP allow-list, no rate limit, no replay window (R-05). |

---

## P0-05 — Webhook amount and currency equality

| Field | Detail |
|---|---|
| **Files** | `src/app/api/payments/webhook/[provider]/route.ts:128-141` |
| **Implementation** | Rejects when `amount` is non-finite, ≤ 0, or does not equal the stored amount after `Math.round`; rejects a currency mismatch when both sides carry a currency. |
| **Failure path traced** | `amount=0` → 400. `amount` absent → `Number(0)` → 400. `amount` = stored ± 0.4 → **accepted** (rounding tolerance). Callback without `currency` → **accepted** regardless of the stored currency. Provider name mismatch → 400. |
| **Test** | No committed test. |
| **Status** | **PARTIAL** |
| **Residual** | Three concrete gaps: (a) `Math.round` admits a mismatch below 0.5 in either direction, which is wrong for money even as `Float`; (b) currency is only compared when the callback supplies it, so a provider that omits the field bypasses the check; (c) the reference lookup is `findFirst({ providerReference })` on a non-unique, non-indexed column (DB-05), so duplicate references resolve to an arbitrary row. |

---

## P0-06 — Gateway transaction ownership

| Field | Detail |
|---|---|
| **Files** | `src/app/api/payments/create-gateway/route.ts:48-56` |
| **Implementation** | Loads the transaction with its customer, resolves the caller's scope, and calls `canAccessTransaction`. Failure returns 404 before reading provider configuration. |
| **Failure path traced** | `CUSTOMER` requesting another customer's transaction → 404. `RESELLER` requesting a transaction outside its subtree → 404. `SUPER_ADMIN` → allowed. Non-`PENDING` transaction → 400. No scope (`none`) → `canAccessTransaction` returns false → 404. |
| **Test** | No committed test. |
| **Status** | **VERIFIED** (static, ownership control only) |
| **Residual** | Ownership is correct but the feature is not functional: **R-07 confirmed** — the returned `paymentUrl` is `https://checkout.${provider}.sandbox.com/pay/...` (line 82), no provider API is called, and `mode` (line 94) is echoed from config as if it were live. **R-04 confirmed** — a `Payment` row is only *updated* when one already exists (`if (existingPayment)`, line 64); otherwise no row is created, so the webhook for that reference returns 404 and the customer can never be marked paid. |

---

## P0-07 — Credential encryption and masking

| Field | Detail |
|---|---|
| **Files** | `src/lib/crypto.ts`, `src/lib/credentials.ts`; creation sites `vpn-accounts/create`, `portal/reseller/create-account`, `provisioner.ts`, `seed.ts` |
| **Implementation** | AES-256-GCM, 12-byte nonce, 16-byte tag, format `v1:nonce:tag:ciphertext`; `buildCredentialFields` throws when the key is unavailable instead of falling back to plaintext; `publicValue` holds a mask (`first4••••last4`); the detail route strips `secretEncrypted` and replaces `publicValue` with the revealed value only after the tenant check. |
| **Evidence** | `crypto.ts:116-131` encrypt; `:142-176` decrypt with tag verification; `credentials.ts:29-40` build + mask; `:52-66` reveal order; `vpn-accounts/[id]/route.ts:105-114` ciphertext stripped from the response. |
| **Failure path traced** | Missing key in production → `encrypt` returns null → `buildCredentialFields` throws, so no row is written. Tampered ciphertext → `decipher.final()` throws → `null`. Tampered `publicValue` mask → not used, because `isMasked` detects `•`. Legacy row (Base64 in `secretEncrypted`, real secret in `publicValue`) → still reveals, by design. |
| **Test** | No committed test. Ad-hoc run (reported 6 credential assertions) not retained. |
| **Status** | **PARTIAL** |
| **Residual** | (a) **R-02 confirmed** — no AAD, so a ciphertext copied from row A into row B still decrypts; `keyVersion` is the literal `"v1"` (`credentials.ts:39`), not a key identifier, and `crypto.ts` holds one global key with a placeholder `rotateEncryptionKey()` returning `{migrated:0, failed:0}`. (b) **G0-F-03** — `decrypt()` treats *any* string not starting with `v1:` as Base64 and returns the decoded bytes without authentication (`crypto.ts:167-173`), so a corrupted or attacker-supplied non-`v1` value yields attacker-chosen plaintext rather than `null`. (c) Legacy rows still keep the usable secret in plaintext `publicValue`; the migration script exists (`scripts/reencrypt-vpn-credentials.ts`) but has not been run. (d) When `NODE_ENV !== "production"`, the key is derived from `DATABASE_URL` with a fixed salt (`crypto.ts:54`) — safe only if `NODE_ENV` is always correct in production. |

---

## New finding from this verification

### G0-F-01 — Write handlers do not enforce tenant scope

| Field | Detail |
|---|---|
| **Files** | `vpn-accounts/[id]/route.ts:101` (PATCH), `:197` (DELETE); `customers/[id]/route.ts:98`, `:214`; `transactions/[id]/route.ts:86` |
| **Fact** | All five handlers authorize with a static role permission and then mutate by raw `id`. None calls `resolveTenantScope` or a `canAccess*` helper. |
| **Why it is not exploitable today** | `ROLE_PERMISSIONS` (`auth.ts:44-65`) grants `vpn_accounts.manage`, `customers.manage`, `transactions.manage` only to SUPER_ADMIN and ADMIN; both map to scope `all`. CUSTOMER and RESELLER hold only `.view`. |
| **Why it must still be fixed** | The RBAC UI permits an operator to grant any permission key to any role, and WP-01 replaces static checks with that database matrix. The first such grant turns these five handlers into cross-tenant writes. The read/write asymmetry also means any future role with `manage` but a narrow scope inherits an unguarded handler. |
| **Blueprint package** | WP-01 (same change as the RBAC switch) |
| **Required test** | TI-06, TI-07, TI-08 in `05_TEST_HARNESS_PLAN.md` |

---

## Verification limits

- No runtime execution: no `.env`, no database file, no Redis. Every status above
  is static analysis with failure-path tracing.
- The P0 ad-hoc assertions reported during the earlier wave left no artifacts in
  the repository; they are recorded as historical claims, not as evidence.
- `git` metadata is absent, so "what changed in the P0 wave" cannot be diffed
  against a previous commit.
