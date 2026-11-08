# GATE 0 — GATE 1 IMPLEMENTATION READINESS

**Scope:** WP-01 (authorization kernel & tenant scoping), WP-02 (session),
WP-16a (migration & compose).
**Question:** can these start, in what order, and under which conditions?

**Answer:** WP-01 and WP-02 can start as **code-only** work after a minimal test
harness exists. WP-16a must be split: the compose/schema-parity half can start,
the migration baseline half is **BLOCKED**.

---

## 1. Current facts that constrain the plan

| Fact | Evidence | Consequence |
|---|---|---|
| 94 route files, 137 `getSessionUser()` calls, 102 `hasPermission()` calls | repository scan | A guard refactor is a wide diff; it must be mechanical and test-backed |
| Two authorization systems coexist | `auth.ts:44-65` static table; `rbac.ts:112` DB check used in 7 files | Any route can drift; the switch must be one-way with a shadow phase |
| DB has 7 roles, static table has 4 | `schema.prisma` role enum vs `ROLE_PERMISSIONS` | OPERATOR, FINANCE, CUSTOMER_SERVICE currently resolve to **no permissions** |
| No `middleware.ts` | absent | No central place to reject unauthenticated requests |
| Session token is the DB primary lookup key | `auth.ts:96` `where: { token }` | Hashing requires dual-read or every session is invalidated |
| No migration history | `prisma/migrations` absent | Session schema change cannot be deployed safely |
| Dashboard is unscoped for all roles | `dashboard/route.ts:39-61` | The highest-impact fix is also the smallest diff |

---

## 2. WP-01 — Authorization kernel & tenant scoping

### 2.1 What it must deliver

1. `Principal` type: `{ userId, role, scope, permissions }`, resolved once per
   request.
2. `withAuth(permission, handler)` wrapper: authentication, permission,
   scope resolution, 404-on-foreign-resource, audit of denials.
3. Dashboard scoping (R-01, G0-F-02) — counts, recent transactions, metrics,
   audit logs.
4. Tenant scope on the five write handlers (G0-F-01).
5. Shadow mode for DB RBAC: compute both static and DB decisions, log
   divergence, enforce only after the divergence report is clean.
6. Remove the static table only after the shadow window.

### 2.2 Files

| Action | Path |
|---|---|
| New | `src/lib/principal.ts`, `src/lib/with-auth.ts`, `src/lib/scope-repo.ts` |
| Modify | `src/lib/auth.ts` (stop exporting `hasPermission` to routes), `src/lib/rbac.ts` (cache + fallback), `src/lib/tenant-scope.ts` (cache, depth handling) |
| Modify | `src/app/api/dashboard/route.ts` (first fix) |
| Modify | `src/app/api/vpn-accounts/[id]/route.ts`, `customers/[id]/route.ts`, `transactions/[id]/route.ts` (write scope) |
| Then | the remaining 90 route files, migrated in batches by module |
| New | `tests/tenant/*.test.ts` |

### 2.3 Dependencies and conflicts

| Dependency | State |
|---|---|
| Test harness | **required** — without it a 94-file refactor cannot be verified |
| WP-02 | both edit `auth.ts`; sequence them, do not parallelize |
| WP-15 (headers/middleware) | shares the middleware file; WP-01 creates it, WP-15 extends it |
| WP-14 (API keys) | API-key auth must produce a `Principal` too; design the type now |

### 2.4 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Staff lockout when DB RBAC enforces | Medium | High | shadow mode + SUPER_ADMIN bypass + `AUTH_KERNEL=legacy` flag |
| A route silently keeps the old check | High (94 files) | High | deny-by-default wrapper + a test that greps for `hasPermission(` outside `auth.ts` |
| Scope double-filtering breaks counts | Medium | Medium | TI-04/TI-05 assert both `items` and `pagination.total` |
| Reseller tree cache serves stale scope after re-parenting | Low | Medium | 30 s TTL + invalidate on reseller update |
| Dashboard change hides data staff need | Low | Medium | TI-03 asserts the global view for staff |

### 2.5 Feature flag and rollback

`AUTH_KERNEL=legacy|shadow|enforce`.

- `legacy`: current behaviour, wrapper computes but does not enforce.
- `shadow`: wrapper computes the decision, logs divergence, still uses legacy.
- `enforce`: wrapper decides.

Rollback = set `AUTH_KERNEL=legacy` and redeploy; no data change is involved.
The dashboard scoping is **not** flaggable in the same way — it must be a hard
fix, because the vulnerable behaviour is the default. Its rollback is a code
revert, which is acceptable because it only removes a leak.

### 2.6 Must-pass tests

TI-01, TI-02, TI-03, TI-04, TI-05, TI-06, TI-07, TI-08, TI-09, TI-10.

### 2.7 Verdict

**GO**, in four sequential batches:

1. WP-01a — dashboard scoping + `Principal` type (small, high value).
2. WP-01b — write-handler scope (five handlers).
3. WP-01c — `withAuth` wrapper + middleware, migrate read-only modules.
4. WP-01d — DB RBAC shadow, then enforce, then delete the static table.

---

## 3. WP-02 — Session

### 3.1 What it must deliver

1. Store `sha256(token)` instead of the token, with a `sha256:` prefix.
2. Dual-read: a cookie without the prefix is looked up by raw value (legacy
   window), then upgraded in place on next successful use.
3. Configurable TTL (`SESSION_TTL_HOURS`) and idle timeout
   (`general.session_timeout_minutes`), both currently unread.
4. Rotation on privilege change and on password change; revoke-all-devices.
5. `__Host-` cookie prefix, `secure`, `sameSite=lax`, explicit path.
6. Use `SESSION_SECRET` or remove it from required env (NEW-08).

### 3.2 The schema-free path (critical)

Do **not** add a `tokenHash` column. The existing `Session.token` column is
`String @unique`; store `sha256:<hex>` there. Lookup:

```
if (cookie.startsWith("sha256:")) where = { token: cookie }
else                              where = { token: sha256(cookie) }  // after upgrade
```

Legacy rows keep their raw token until first use, at which point the row is
rewritten to the hashed form. This gives rotation without a migration, which is
mandatory while WP-16a-2 is blocked.

### 3.3 Files

| Action | Path |
|---|---|
| Modify | `src/lib/auth.ts` (create/get/destroy, cookie options, TTL) |
| Modify | `src/app/api/auth/login/route.ts`, `logout/route.ts`, `me/route.ts` |
| Modify | `src/app/api/security/change-password/route.ts`, `sessions/*` (new revoke-all) |
| New | `tests/auth/session.test.ts` |
| Later | `src/middleware.ts` cookie validation (shared with WP-01) |

### 3.4 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Mass logout if dual-read is wrong | Medium | High | `SESSION_TOKEN_MODE=legacy|dual|hashed`, ship `dual` first |
| Token collision on hash (theoretical) | Very low | High | SHA-256 over 2×UUID; unique index already present |
| Idle timeout logs out active staff | Medium | Medium | default to current 24 h until the setting is explicitly enabled |
| Password change does not revoke other sessions | Medium | High | revoke-all in the same transaction as the password write |

### 3.5 Feature flag and rollback

`SESSION_TOKEN_MODE=legacy|dual|hashed`. Rollback to `legacy` accepts already
hashed rows only if the code keeps the prefix branch — keep it permanently, it
costs nothing.

### 3.6 Must-pass tests

AS-01, AS-02, AS-03, AS-04, AS-08 (OTP field removed in WP-03, asserted here as a
contract).

### 3.7 Verdict

**GO WITH CONDITION C2**: no schema change, dual-read first, flag-gated.

---

## 4. WP-16a — Migration & compose

Split into two independently shippable halves.

### 4.1 WP-16a-1 — Compose and schema parity (code-only, no DB)

| Fix | File | Evidence |
|---|---|---|
| Build context | `deploy/docker/docker-compose.yml:103` → `context: ../..` or move Dockerfile | Dockerfile is at repo root |
| Realtime port | `:203` `3005:3003` vs nginx `127.0.0.1:3003` | mismatch |
| Emit URL | add `REALTIME_EMIT_URL` to api/worker env | API cannot reach emit |
| Schema parity | add `TelegramIntegration` to `schema.postgres.prisma` | model diff = 1 |
| `db:push` | remove `--accept-data-loss` from the default script | DB-02 |

Verification: `docker compose config` with a filled env file, `prisma validate`
on both schemas, and a `docker compose build` on a machine with Docker. The last
one is **not possible on this host** without an env file; it is a Gate 1
acceptance item for the owner's environment.

**Verdict: GO WITH CONDITION** — code-only, no database.

### 4.2 WP-16a-2 — Migration baseline (BLOCKED)

Requires, per `04_DATABASE_MIGRATION_READINESS.md` §6:

1. A reachable non-production PostgreSQL instance.
2. A production schema dump and a real backup with its manifest.
3. The `AI_ENCRYPTION_KEY` custody procedure.
4. A restore rehearsal on a copy.
5. A money-representation decision.

Without these, any `prisma migrate` command risks resetting a database or
generating a baseline that does not match production. **Do not start.**

**Verdict: BLOCKED.**

---

## 5. Ordering

```
Gate 1A  WP-17a-lite   test runner + 6 seed tests            (no product change)
Gate 1B  WP-01a        dashboard scoping (R-01, G0-F-02)     (closes the worst leak)
Gate 1C  WP-01b        write-handler scope (G0-F-01)         (closes the latent gap)
Gate 1D  WP-02         session hashing, dual-read            (no schema change)
Gate 1E  WP-01c/d      wrapper, shadow RBAC, enforce         (wide diff)
Gate 1F  WP-16a-1      compose + schema parity               (code-only)
Gate 1G  WP-16a-2      migration baseline                    (BLOCKED — owner input)
```

Why this order:

- 1A first: every later step needs a failing test to prove the fix.
- 1B before 1C: the dashboard leak is exploitable **now**; the write gap is not.
- 1D after 1B/1C: it touches `auth.ts`, which 1B/1C also touch; sequencing avoids
  merge conflicts.
- 1E last among code work: it is the widest diff and should land on a tree that
  is already green.
- 1F independent; can run in parallel with 1D if a second engineer is available.

---

## 6. Lockout analysis (staff)

The realistic lockout path is WP-01d (DB RBAC enforcement), not WP-02.

| Scenario | Effect | Prevention |
|---|---|---|
| DB role rows missing for OPERATOR/FINANCE/CUSTOMER_SERVICE | those staff can do nothing | seed script + startup check that fails loudly, not silently |
| `hasPermissionDb` returns empty on DB error | everyone is denied | explicit error state; fall back to static table **and alert**, never to "allow" |
| SUPER_ADMIN has no explicit permission rows | total lockout | hard-coded bypass for SUPER_ADMIN, tested |
| Cached permissions survive a revoke | up to 10 s of stale access | acceptable; document it |
| Shadow mode left on in production | old checks still enforced | startup log + `/api/health` exposes the mode |

Emergency recovery must exist before enforcement: an env flag
`AUTH_KERNEL=legacy`, and a CLI script that grants SUPER_ADMIN all permissions.

---

## 7. Rollback criteria per package

| Package | Rollback trigger | Action | Data impact |
|---|---|---|---|
| WP-01a dashboard | staff cannot see needed data | revert commit | none |
| WP-01b write scope | legitimate staff write blocked | revert commit | none |
| WP-02 session | login failure rate > 5% or mass logout | `SESSION_TOKEN_MODE=legacy` | none (dual-read keeps rows) |
| WP-01c/d RBAC | any staff lockout | `AUTH_KERNEL=legacy` | none |
| WP-16a-1 compose | container fails to build/start | revert compose | none |
| WP-16a-2 migration | migration fails mid-way | restore from pre-migration backup | **data** — requires the blocked prerequisites |

---

## 8. Sub-gate recommendation

Do **not** run WP-01, WP-02, WP-16a as one gate. Approve them as five sub-gates
(1A–1F) with 1G blocked. Each sub-gate must end with:

- the must-pass tests green,
- the flag set to its safe default,
- a one-paragraph rollback note,
- no new typecheck or lint errors in touched files (measured against
  `03_PROJECT_BASELINE.md`).

---

## 9. What the owner must decide before Gate 1 starts

1. Approve the test runner choice (`bun test`, no new dependency).
2. Approve the disposable-SQLite test database procedure.
3. Confirm that WP-02 may proceed with the schema-free hashed-token design.
4. Confirm the dashboard scoping behaviour for CUSTOMER and RESELLER (what they
   should see, exactly).
5. Provide the WP-16a-2 prerequisites or explicitly defer that work package.
6. Decide whether the Next.js security upgrade (G0-F-05) is scheduled before or
   in parallel with Gate 1 — it is independent but urgent.
