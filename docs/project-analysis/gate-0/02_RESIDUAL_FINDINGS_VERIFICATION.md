# GATE 0 — RESIDUAL FINDINGS VERIFICATION

**Scope:** R-01, R-02, R-05, R-07 from blueprint §2.6, plus findings discovered
during this gate.
**Method:** static trace of the data path from request to response or write, with
the failure and replay branches read explicitly.
**Constraint:** no exploitation against any running system; all reproduction
scenarios below are conceptual and were derived from code.

Status vocabulary: CONFIRMED (code behaves as described), CONFIRMED-WORSE
(impact exceeds the description), NOT REPRODUCIBLE (could not be established).

---

## R-01 — Dashboard data exposure

**Status: CONFIRMED-WORSE. Severity: CRITICAL (recommend elevation from HIGH to P0).**

### Evidence

| Element | Location | Behaviour |
|---|---|---|
| Authorization | `src/app/api/dashboard/route.ts:20` | `hasPermission(user.role, "dashboard.view")` only |
| Who holds it | `src/lib/auth.ts:51` (RESELLER), `:57` (CUSTOMER) | both tenant roles hold `dashboard.view` |
| Platform counts | `dashboard/route.ts:39-41` | `db.customer.count()`, `db.reseller.count()`, `db.transaction.count()` with no `where` |
| Platform revenue | `dashboard/route.ts:42-45` | `aggregate({ where: { status: "PAID" }, _sum: { amount } })`, unscoped |
| Recent transactions | `dashboard/route.ts:52-61` | last 5 transactions **including other customers' `name`, `email`, `customerCode` and payment amounts** |
| Recent audit logs | `dashboard/route.ts:45-50` | last 5 audit rows with staff `name` and `role` |
| Server metrics | `dashboard/route.ts:63-67` | latest metrics with server `name` and `publicIp` |
| Revenue trend | `dashboard/route.ts:94-99` | 6 months of platform-wide paid transactions |

### Conceptual reproduction

1. Log in as any `CUSTOMER` (self-registration exists at `/register`).
2. `GET /api/dashboard`.
3. The response contains `stats.customers`, `stats.resellers`,
   `stats.totalRevenue`, and a `recentTransactions` array whose entries belong to
   other customers, with their email addresses.
4. `recentAuditLogs` reveals which staff accounts are active and what they did.

### Why the blueprint understated it

Blueprint §2.1 described R-01 as "platform-wide counts". The counts are the
smallest part. The endpoint also returns **other tenants' PII** and **internal
audit activity**. This is a direct confidentiality breach requiring no inference,
no timing analysis, and no privileged role.

### Impact

- Cross-tenant PII disclosure (name, email, customer code, invoice amount).
- Business intelligence leakage: total customer count, reseller count, revenue.
- Staff enumeration and operational intelligence (audit log actor names/roles).
- Compliance exposure: the platform cannot claim tenant isolation while a
  customer dashboard returns other customers' records.

### Work package and fix shape

WP-01. The endpoint must branch on `resolveTenantScope`:

- Staff (`all`): full platform view.
- RESELLER: counts and rows limited to `resellerIds` subtree.
- CUSTOMER: own counts, own transactions, no audit log, no server IPs, no
  reseller count.

`recentAuditLogs` and `serverMetrics` must be staff-only regardless of scope.
Server `publicIp` must not be returned to tenant roles (also NEW-03).

### Required tests

- TI-01, TI-02, TI-03 (tenant dashboard isolation)
- TI-09 (customer receives no other customer email)
- TI-10 (customer receives empty audit-log array)

---

## R-02 — Credential ciphertext is not bound to its record

**Status: CONFIRMED. Severity: HIGH.**

### Evidence

| Element | Location | Behaviour |
|---|---|---|
| Cipher construction | `src/lib/crypto.ts:116-131` | `createCipheriv("aes-256-gcm", key, nonce)` with no `setAAD` |
| Field builder | `src/lib/credentials.ts:29-40` | encrypts the bare secret; no row id, field name, or tenant id enters the cipher |
| Key identity | `credentials.ts:39` | `keyVersion: "v1"` is a format constant, not a key id |
| Rotation | `crypto.ts:181-197` | `rotateEncryptionKey()` is a placeholder returning `{migrated: 0, failed: 0}` |
| Key scope | `crypto.ts:31` | one module-level `cachedKey` for the whole process |

### Conceptual reproduction

1. Read `vpnAccount A` credentials row; capture `secretEncrypted` (a DB read, a
   backup, or any future read-only bug is sufficient — the plaintext is not
   required).
2. `UPDATE VpnCredential SET secretEncrypted = <A.ciphertext> WHERE id = <B.id>`.
3. `GET /api/vpn-accounts/B` as B's owner. The route calls
   `revealCredential({ secretEncrypted, publicValue })`; the ciphertext starts
   with `v1:`, the tag verifies (it is a valid ciphertext for the global key), and
   **A's secret is returned to B**.

The swap requires database write access, which raises the bar. The design defect
is that possession of the database alone is enough to move a secret between
tenants and have the application authenticate it as belonging to the new row.
AAD binding (`setAAD(credentialId + ":" + credentialType)`) makes step 3 fail.

### Impact

- A single database write (SQL injection, backup restore error, malicious
  operator, replication mistake) converts into cross-tenant credential
  disclosure with a valid application-level decryption.
- No key rotation path: the placeholder returns zero migrated rows, so rotating
  `AI_ENCRYPTION_KEY` would silently brick every credential (decrypt returns
  null on tag failure) rather than migrate it.
- No key id in the ciphertext means a multi-key future cannot decrypt old rows.

### Work package and fix shape

WP-07. Introduce `keyId` in the envelope
(`v2:<keyId>:<nonce>:<tag>:<ciphertext>`), derive AAD from record identity, keep
a keyring with the previous key for dual-read, and implement the rotation script
against the existing `scripts/reencrypt-vpn-credentials.ts` skeleton.

### Required tests

- CR-02 (AAD mismatch rejected)
- CR-03 (ciphertext swap rejected)
- CR-06 (rotation preserves plaintext)
- CR-07 (old key still decrypts during dual-read window)

---

## R-05 — Webhook event persistence and replay handling

**Status: CONFIRMED. Severity: HIGH.**

### Evidence

| Element | Location | Behaviour |
|---|---|---|
| Dedupe basis | `payments/webhook/[provider]/route.ts:143-149` | `if (payment.status === "PAID") return alreadyProcessed` |
| Reference uniqueness | `prisma/schema.prisma:435` | `providerReference String?` — not unique, not indexed |
| Lookup | route `:117-120` | `findFirst({ where: { providerReference } })` — arbitrary row when duplicates exist |
| Event storage | — | no `PaymentEvent` / `WebhookEvent` model exists in either schema |
| Unknown status | route `:186-190` | returns HTTP 200 `{processed:false, ignored:true}` |
| Conflicting status after PAID | route `:143-149` | returns HTTP 200 `alreadyProcessed:true` for **any** later status |
| Amount tolerance | route `:129` | `Math.round(amount) !== Math.round(payment.amount)` |

### Conceptual reproduction

**A. Silent conflict.** Pay → PAID. Provider later sends `EXPIRED` (wrong
invoice reuse, provider bug, or attacker with a valid signature replay). Route
returns 200 `alreadyProcessed`. No record exists that a contradictory event
arrived, and support cannot reconstruct what happened.

**B. Duplicate reference.** Two `Payment` rows share `providerReference`
(possible because the column is nullable and non-unique, and `create-gateway`
rewrites the reference on an existing row). `findFirst` picks one; the other can
never be settled; the chosen one may be the wrong amount, so the callback is
rejected with `AMOUNT_MISMATCH` forever.

**C. Parallel callbacks.** Two identical PAID callbacks arrive together. Both read
`status = PENDING`. Both execute the `$transaction`. `Payment.update` is
unconditional, so both write PAID; `transaction.updateMany` is guarded by
`status: { not: "PAID" }`, so the second is a no-op. The invariant survives by
accident, but two audit rows are written and nothing prevents a future edit from
removing the `updateMany` guard.

**D. Unhandled failure status.** Provider sends a status the switch does not map
(e.g. `DENIED`, lowercase `paid`). The route returns 200 `ignored`. The provider
stops retrying, and the payment stays PENDING forever with no event record.

**E. Sub-unit mismatch.** Stored `payment.amount = 100000.4`, callback
`100000` → `Math.round` equal → accepted.

### Impact

- No audit trail of gateway events: disputes, double-settlement, and provider
  outages are undiagnosable.
- Conflicting events are acknowledged as success, so providers never retry and
  the conflict is invisible.
- Non-unique reference permits settling the wrong invoice.
- Float comparison tolerates a real mismatch.

### Work package and fix shape

WP-04. Add `PaymentEvent` (provider, externalId, payloadHash, receivedAt,
status, raw body, unique `(provider, externalId, payloadHash)`), make
`providerReference` unique per provider, transition through a state machine that
rejects illegal transitions explicitly (409, logged), and compare money as
decimal/integer minor units.

### Required tests

- PY-01…PY-08 in `05_TEST_HARNESS_PLAN.md`
- PY-09 (conflicting status is recorded and rejected, not acknowledged)
- PY-10 (duplicate reference cannot settle the wrong invoice)

---

## R-07 — Mock gateway URL

**Status: CONFIRMED. Severity: HIGH (functional, not only security).**

### Evidence

| Element | Location | Behaviour |
|---|---|---|
| URL source | `payments/create-gateway/route.ts:82` | `https://checkout.${provider}.sandbox.com/pay/${externalRef}` — a literal string, no HTTP call |
| Provider call | route `:76-81` | comments only; no `fetch` to any provider endpoint |
| Mode disclosure | route `:94` | `mode: providerConfig.mode` returned to the client as if authoritative |
| Payment creation | route `:63-73` | `findFirst` then `update` **only if a row exists**; no `create` |
| Side effect | route `:66-71` | rewrites `providerReference` on the existing payment |

### Conceptual reproduction

1. Customer creates a transaction (PENDING).
2. `POST /api/payments/create-gateway` with a configured provider.
3. Response contains a `sandbox.com` URL that resolves to nothing, plus
   `mode: "sandbox"` or `"production"` from settings.
4. If no `Payment` row existed, none is created. The webhook later receives a
   callback for `MVMP-...` and returns 404 `NOT_FOUND`, so even a real provider
   payment could not settle the invoice.
5. If a row existed, its `providerReference` is overwritten. Any earlier pending
   invoice reference becomes orphaned, and a late callback for it returns 404.

### Impact

- Customers cannot pay through the gateway at all; the UI presents a dead link
  as a checkout page.
- A production deployment would silently fail every card/QRIS payment.
- Overwriting the reference breaks idempotency for the previous attempt.
- Security relevance: `mode` is disclosed from configuration without verifying
  that the corresponding live credentials exist, so a "production" label does
  not imply a production integration.

### Work package and fix shape

WP-05. Provider adapter interface with `createPayment`, `parseCallback`,
`verifySignature`; create the `Payment` row **before** calling the provider
(PENDING, unique reference), persist provider response ids, and return the real
`paymentUrl`/`qrString`. `mode` must come from the adapter's verified
environment, never from a settings string.

### Required tests

- PY-11 (gateway creates a Payment row)
- PY-12 (adapter failure leaves no orphan payment)
- PY-13 (production mode requires live credentials)

---

## New findings from Gate 0

### G0-F-01 — Write handlers lack tenant scope

CONFIRMED. Evidence and rationale in `01_DONE_P0_VERIFICATION.md`. Latent today
because only SUPER_ADMIN/ADMIN hold the `manage` permissions; becomes live the
moment WP-01's database RBAC grants `manage` to a tenant role. Must be closed in
the same change. Tests TI-06…TI-08.

### G0-F-02 — Dashboard returns transaction PII, not only aggregates

CONFIRMED-WORSE, part of R-01 but recorded separately because it changes the
severity classification and the fix scope. `recentTransactions` includes
`customer: { name, email, customerCode }` (`dashboard/route.ts:52-61`) and
`recentAuditLogs` includes staff identity (`:45-50`). Fix must remove these for
tenant roles, not merely add a `where` to the counts.

### G0-F-03 — Unauthenticated Base64 fallback in `decrypt()`

CONFIRMED. `src/lib/crypto.ts:167-173`: any ciphertext that does not start with
`v1:` is Base64-decoded and returned as plaintext, with no integrity check. A
corrupted row, a manually edited value, or a future format (`v2:`) written by a
newer node would be "decrypted" into arbitrary bytes and used as a VPN secret.
Additionally, `crypto.ts:54` derives the key from `DATABASE_URL` with a fixed salt
whenever `NODE_ENV !== "production"`; a mis-set `NODE_ENV` on a production host
silently downgrades to a predictable key.

Fix (WP-07): explicit envelope parsing, reject unknown versions, remove the
implicit Base64 branch after the migration completes, and require an explicit
opt-in flag for the legacy path.

### G0-F-04 — Webhook acknowledges unhandled and conflicting statuses

CONFIRMED. Route `:186-190` returns 200 for any unmapped status, and `:143-149`
returns 200 for any event arriving after PAID. Providers interpret 200 as
"delivered" and stop retrying. A real failure status that the switch does not
recognise is therefore lost. Fix in WP-04: persist the event, return 422/409 for
states the platform cannot apply, and alert.

### G0-F-05 — Four critical Next.js RCE advisories

CONFIRMED by `bun audit`: Next.js 16.1.1 is affected by
GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4, GHSA-2464-fhr4-w9xw and
GHSA-673q-mjm6-r5xr (unauthenticated RCE), plus high-severity SSRF in image
optimization. Fixed in 16.3.3 / 16.4.0 depending on the advisory. This is a
dependency upgrade, prohibited at Gate 0, and must be scheduled as its own
change with a build and smoke test — not folded into a security refactor.

### G0-F-06 — Payment provider secrets stored as non-sensitive and returned in bulk

CONFIRMED. `settings/providers/route.ts:80` creates the `payment.providers` row
with `isSensitive: false`; `/api/settings/system/route.ts:45-52` filters out only
`isSensitive === true`, so the row is returned with webhook tokens and server
keys in plaintext to any caller holding `settings.view` (SUPER_ADMIN, ADMIN).
Fix (WP-06): store secrets under a sensitive key, mask on read, return only
`configured: true/false` booleans.

### G0-F-07 — `mockOtp` returned in every environment

CONFIRMED. `otp.ts:185` returns `mockOtp: plaintext` unconditionally;
`security/otp/request/route.ts:57` forwards it. The inline comments assert
production behaviour that the code does not implement. Fix (WP-03): remove the
field from the response contract entirely; deliver via the configured channel
only, and gate any development echo behind an explicit non-production flag that
also requires a non-production database.

### G0-F-08 — No local runtime environment

CONFIRMED. No `.env` (only `.env.production.example`), no `prisma/*.db`, no
running database or Redis. `prisma validate` fails with P1012 until a
`DATABASE_URL` is supplied. Runtime verification of any control is therefore
impossible on this host; all Gate 0 statuses are static.

---

## Open residual count

| Category | Count |
|---|---|
| Requested residuals confirmed | 4 (R-01, R-02, R-05, R-07) |
| New findings | 8 (G0-F-01…G0-F-08) |
| Total open | 12 |
| Closed by this gate | 0 (no fixes permitted) |
