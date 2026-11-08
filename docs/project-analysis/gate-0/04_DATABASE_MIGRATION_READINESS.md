# GATE 0 — DATABASE & MIGRATION READINESS

**Question:** can Gate 1 change the schema safely?
**Answer:** **NO.** WP-16a-2 is BLOCKED. The repository has no migration history,
no local database, no verified backup, and no restore rehearsal. Gate 1 may
proceed only with code-only work that does not alter the schema.

All findings below are read-only: schema files, directory contents, and scripts.
No database was created, connected to, or migrated.

---

## 1. Schema inventory

| Metric | SQLite (`prisma/schema.prisma`) | PostgreSQL (`prisma/schema.postgres.prisma`) |
|---|---|---|
| Models | 64 | 63 |
| Provider | `sqlite` (line 9) | `postgresql` |
| `prisma/migrations` | absent (0 entries) | absent |
| Migration history | none | none |

Model-level drift, confirmed by diffing model names:

```
< TelegramIntegration      (present in SQLite schema, absent in PostgreSQL schema)
```

Every other model name matches. `TelegramIntegration` exists only in the SQLite
schema, so a PostgreSQL deployment cannot store Telegram configuration at all —
the Telegram routes would fail at runtime with a missing-table error.

**Interpretation.** The two schemas are not interchangeable. Any migration plan
must first decide which schema is authoritative and bring the other to parity
before generating a baseline.

---

## 2. Tenant, session, payment, credential, audit structure

### 2.1 Tenant relations

| Model | Key fields | Notes |
|---|---|---|
| `Customer` | `userId` unique, `resellerId` nullable | tenant root for customer-scoped data |
| `Reseller` | `userId` unique, `parentResellerId` nullable | hierarchy; BFS capped at 5 levels in code |
| `VpnAccount` | `customerId`, `serverId`, `username` | `@@index([serverId])` only |
| `Transaction` | `customerId`, `resellerId` nullable, `amount Float` | money as float |
| `Payment` | `transactionId`, `providerReference String?` | no unique, no index |

`VpnAccount` has **no** `@@unique([serverId, username])`. Duplicate usernames per
server are therefore possible, which breaks provisioning idempotency and any
future "find by username" lookup.

`ResellerLedger.transactionId` is a plain `String?` with no relation and no
foreign key, so ledger rows can reference transactions that do not exist.

### 2.2 Session and authentication fields

| Field | Type | Observation |
|---|---|---|
| `Session.token` | `String @unique` | **plaintext bearer token** — a DB read or backup yields live sessions |
| `Session.expiresAt` | `DateTime` | fixed 24 h from creation (`auth.ts:12,70`) |
| `Session.revokedAt` | `DateTime?` | per-token revocation only |
| `Session.ipAddress`, `userAgent` | `String?` | recorded, never validated |
| — | — | no `tokenHash`, no `lastUsedAt`, no `rotatedFrom`, no idle timeout |

`createSession` writes `uuidv4() + "." + uuidv4()` directly into `token`
(`auth.ts:69`). `SESSION_SECRET` is required by `env-validate.ts` but is never
read by any session code (NEW-08 confirmed).

### 2.3 Payment and webhook

| Field | Type | Observation |
|---|---|---|
| `Payment.providerReference` | `String?` | nullable, **not unique, not indexed** |
| `Payment.amount` | `Float` | money as binary float |
| `Payment.status` | enum `PaymentStatus` | PENDING/PAID/FAILED/EXPIRED (good) |
| `Payment.qrisData`, `vaNumber` | `String?` | provider payload not constrained |
| `PaymentEvent` | — | **does not exist**; no durable webhook log |

A unique constraint on `(provider, providerReference)` is the single most
important schema change for payment integrity, and it cannot be applied safely
until existing duplicates are counted and resolved.

### 2.4 VPN credential

| Field | Type | Observation |
|---|---|---|
| `secretEncrypted` | `String` (required) | AES-GCM envelope for new rows; Base64 for legacy rows |
| `publicValue` | `String?` | masked for new rows; **plaintext secret for legacy rows** |
| `keyVersion` | `String @default("v1")` | format constant, not a key id |
| — | — | no AAD column, no `keyId`, no rotation timestamp beyond `rotatedAt` |

The schema cannot express "which key encrypted this row", so a key rotation has
no way to be rolled back per row.

### 2.5 Audit log

| Aspect | State |
|---|---|
| Indexes | `@@index([action])`, `@@index([resourceType])`, `@@index([createdAt])` — adequate |
| Retention | none; `AUDIT_LOG_RETENTION_DAYS` is never read |
| Partitioning | none |
| Volume risk | every route writes; 74 `auditLog()` calls across 61 files |

---

## 3. Money representation risk (DB-03)

`Float` appears in every monetary field:

| Line | Model | Field |
|---|---|---|
| 111 | `Server` | `monthlyCost` |
| 303 | `Reseller` | `commissionRate` |
| 305 | `Reseller` | `balance` |
| 325 | `ResellerLedger` | `amount` |
| 326 | `ResellerLedger` | `balanceAfter` |
| 340 | `ResellerCommission` | `amount` |
| 355 | `Package` | `price` |
| 411 | `Transaction` | `amount` |
| 437 | `Payment` | `amount` |

Migrating to `Decimal` is not a mechanical type swap:

1. **Prisma client API changes.** `Decimal` values are objects, not numbers.
   Arithmetic, comparison, and `JSON.stringify` all change. Every route that
   computes `balanceAfter`, commission, or totals must be updated in the same
   release.
2. **Aggregations change type.** `_sum.amount` returns `Decimal | null`; current
   code does `revenueAgg._sum.amount ?? 0` and adds it to a `number`.
3. **Rounding.** Existing floats already contain representation error. Choosing
   `Decimal(18,2)` will round on write; the sum of rounded rows may differ from
   the previously displayed total. Finance reconciliation is required before the
   switch, not after.
4. **SQLite differences.** SQLite has no native decimal type. Prisma stores
   `Decimal` as `DECIMAL`/text depending on provider; ordering and aggregation in
   raw SQL behave differently from PostgreSQL. The sandbox (SQLite) and
   production (PostgreSQL) would diverge.
5. **Idempotency.** `Math.round` comparisons in the webhook must become exact
   minor-unit comparisons at the same time, or a rounding change silently starts
   accepting/rejecting different callbacks.

**Recommendation.** Prefer **integer minor units** (`BigInt` or `Int` cents) over
`Decimal` for amounts, with a display-layer formatter. If the owner requires
`Decimal`, do it in an expand→dual-write→verify→contract sequence with a
reconciliation report, never as a single migration.

---

## 4. Migration history and the `db:push` habit

```
$ ls prisma/migrations
(absent)

package.json:
  "db:push":    "prisma db push --accept-data-loss"
  "db:migrate": "prisma migrate dev"
  "db:reset":   "prisma migrate reset"
```

`db:push --accept-data-loss` is the documented way to apply schema changes. It
compares schema to database and can drop columns or tables without a migration
record. `prisma migrate dev` cannot work because there is no migration history:
it would attempt to create an initial migration from the current schema against
a database that already contains data, and will offer to reset it.

**There is no baseline that supports `expand → migrate → contract`.** Creating one
requires:

1. A dump of the production schema (not data) — `prisma migrate diff --from-url
   ... --to-schema-datamodel prisma/schema.postgres.prisma --script`.
2. A baseline migration committed as `0_init`.
3. `prisma migrate resolve --applied 0_init` on each existing database.
4. Every later change as an additive migration, with the contract step deferred.

Steps 1 and 3 require a database this host does not have (G0-F-08).

---

## 5. Backup and restore readiness

| Artifact | Path | Status |
|---|---|---|
| Docker backup sidecar | `deploy/docker/backup-cron` | present |
| Cron backup script | `deploy/cron/mvmp-backup` | present |
| Backup script | `scripts/deploy/backup.sh` (referenced by restore) | present |
| Restore script | `scripts/deploy/restore.sh` | present, `set -euo pipefail`, manifest validation, safety backup, confirmation prompt |
| Docker restore | `scripts/deploy/docker-restore.sh` | present |
| Rollback script | `scripts/deploy/rollback.sh` | present |

What the restore script claims to do (header, lines 9-20): validate path and
manifest, take a safety backup, stop api/worker/realtime, restore PostgreSQL,
restore `/etc/mvmp`, restore Redis RDB, start services, verify health.

What cannot be established:

- Whether a backup has ever been produced by this code path.
- Whether a restore has ever been executed.
- Whether the safety backup is itself restorable.
- Whether the credential ciphertext remains decryptable after restore (it
  depends on `AI_ENCRYPTION_KEY`, which lives outside the database — a restore
  without the key yields an unusable credential store).

**Status: RESTORE NOT VERIFIED.** A script's existence is not evidence of a
working restore. Gate 0 has no database and no backup to test with.

---

## 6. Readiness verdict

| Capability | Ready? | Reason |
|---|---|---|
| Generate a baseline migration | **NO** | no database, no schema dump of production |
| Apply schema changes without data loss | **NO** | `db:push --accept-data-loss` is the only path |
| Roll back a migration | **NO** | no migration history, no down migrations |
| Verify a backup | **NO** | no backup artifact available |
| Rehearse a restore | **NO** | no database, no backup |
| Decrypt credentials after restore | **UNKNOWN** | depends on external key custody |
| Decimal migration | **NO** | 9 float money fields, aggregation and API changes |

**WP-16a-2 (migration baseline) is BLOCKED.**

Preconditions to unblock, to be supplied by the owner:

1. Target engine confirmation (PostgreSQL 16 assumed) and a non-production
   instance reachable from the implementation environment.
2. A recent production backup (dump + manifest) and the matching
   `AI_ENCRYPTION_KEY` custody procedure.
3. An approved maintenance window for a restore rehearsal on a copy.
4. A decision on money representation: integer minor units or `Decimal`.
5. Confirmation of which schema is authoritative, given the
   `TelegramIntegration` drift.

Until then, Gate 1 may change **code only**, and any package that needs a new
column (WP-04 event store, WP-07 key id, WP-02 token hash if stored in a new
column) must use a schema-free interim design:

- WP-02: store the hash in the existing `Session.token` column with a
  `sha256:` prefix and dual-read. **No migration.**
- WP-04: stage the event payload in the existing `Payment.vaNumber`/`qrisData`
  fields is **not acceptable**; defer the event store until WP-16a-2 unblocks, or
  add the table in the same gated migration release.
- WP-07: the envelope format can carry a key id without a schema change because
  `keyVersion` is already a string column.

---

## 7. Acceptance criteria for WP-16a-2

- `prisma/migrations/0_init` exists and applies cleanly to an empty database.
- `prisma migrate deploy` is the only documented deploy path; `db:push` is
  removed from `package.json`.
- A restore from a real backup completes on a copy and a row-count plus
  checksum report matches the source.
- A credential row encrypted before the restore decrypts after the restore.
- The migration is rehearsed twice: once on an empty database, once on a copy of
  production data.
- No step requires `--accept-data-loss`.
