# GATE 0 — PROJECT BASELINE

**Purpose:** capture the state of the project before any Gate 1 change, so that
later regressions can be attributed and so that pre-existing failures are not
mistaken for new ones.

**Rules applied:** only commands already defined in the project or standard
read-only checks were run. No dependency was installed or upgraded. No file
outside `docs/project-analysis/gate-0/` was written. `next build` wrote only
`.next/` build output.

**Environment:** Windows, Git Bash; Bun 1.4.4, Node v26.1.0, Docker 29.8.0,
Prisma CLI 6.19.3 (from `node_modules`). No `.env`, no database file, no Redis.

---

## 1. Result table

| Check | Status | Command | Exit | Result |
|---|---|---|---|---|
| Typecheck | **FAIL** | `./node_modules/.bin/tsc --noEmit` | 1 | 43 errors |
| Lint | **FAIL** | `./node_modules/.bin/eslint .` | 1 | 33 errors, 0 warnings |
| Unit test | **NOT AVAILABLE** | — | — | no runner, no config, no `test` script |
| Integration test | **NOT AVAILABLE** | — | — | no suite, no disposable DB harness |
| E2E | **NOT AVAILABLE** | — | — | no Playwright/Cypress |
| Production build | **FAIL** | `next build` (via local binary) | 1 | compiled in 10.5 s, prerender `/` failed |
| Prisma validation (SQLite) | **PASS** (with env) | `prisma validate` | 0 | schema valid |
| Prisma validation (Postgres) | **PASS** (with env) | `prisma validate --schema prisma/schema.postgres.prisma` | 0 | schema valid |
| Prisma validation (default env) | **FAIL** | `prisma validate` without `DATABASE_URL` | 1 | P1012 environment variable not found |
| Docker Compose config | **FAIL** | `docker compose -f deploy/docker/docker-compose.yml config --quiet` | 1 | missing required variables |
| Dependency audit | **FAIL** | `bun audit` | 0 | 55 vulnerabilities: 4 critical, 24 high, 23 moderate, 4 low |

Aggregate: **1 PASS, 5 FAIL, 3 NOT AVAILABLE.** No baseline test executed, so
"tests passed" is zero and "tests failed" is zero — there are no tests.

---

## 2. Typecheck

```
$ ./node_modules/.bin/tsc --noEmit
exit 1 — 43 errors
```

Distribution (top files):

| File | Errors |
|---|---|
| `src/app/api/chat/route.ts` | 17 |
| `scripts/seed.ts` | 10 |
| `src/app/api/portal/customer/dashboard/route.ts` | 3 |
| `src/components/mvmp/views/VpnAccountsView.tsx` | 2 |
| `src/components/mvmp/portal/views/CustomerTransactions.tsx` | 2 |
| `src/app/api/vpn-accounts/create/route.ts` | 2 |
| `src/app/api/portal/reseller/create-account/route.ts` | 2 |
| remaining files (7) | 1 each |

Representative messages:

```
src/components/mvmp/views/CustomersView.tsx(604,17): TS2345
  '{ name; email; phone; password; status; resellerId }' is missing
  'packageId', 'serverId' from type 'CustomerFormState'

src/components/mvmp/views/TransactionsView.tsx(273,35): TS2345
  'string | null | undefined' is not assignable to 'string | Date | null'
```

**Interpretation.** These are real type errors, not lint noise. They are
invisible in CI because there is no CI, and invisible to the build because
`next.config.ts:7` sets `ignoreBuildErrors: true`. Gate 1 must not add new
errors in the files it touches; a global "fix all 43" is out of scope and would
blur the security diff.

**Note for Gate 1.** `src/app/api/chat/route.ts` (17 errors) is scheduled for
WP-13, not WP-01. `scripts/seed.ts` (10) is scheduled for WP-16a. Neither
blocks the first Gate 1 wave.

---

## 3. Lint

```
$ ./node_modules/.bin/eslint . 
exit 1 — 33 problems (33 errors, 0 warnings)
```

Dominant rule: `react-hooks/set-state-in-effect`, concentrated in client views
that fetch on mount and then call `setState`. There is no `eslint.config`
suppression and no `lint` step in any pipeline.

**Interpretation.** The lint baseline cannot be used as a gate yet: it already
fails. Gate 1 acceptance must be "no new lint errors in touched files", measured
against this snapshot, not "lint passes".

---

## 4. Production build

```
$ next build
✓ Compiled successfully in 10.5s
Error occurred prerendering page "/".
Export encountered an error on /page: /, exiting the build.
exit 1
```

Root cause (pre-existing, outside the security scope): `src/app/page.tsx` calls
`useSearchParams()` without a Suspense boundary, so static prerender of `/`
throws. The compile phase succeeds, which means the build failure is not a
TypeScript or bundling problem.

`package.json` defines `build` as
`next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/`.
Because `next build` exits non-zero, the copy steps never run, so
`.next/standalone` is not refreshed — the artifact used by `start` and by the
Dockerfile is stale or absent.

**Interpretation.** "Deploy and test" is unavailable until this is fixed. It is a
one-file frontend change (wrap the page in `<Suspense>`), but it is not part of
the security blueprint and is therefore recorded, not fixed, at Gate 0.

---

## 5. Prisma validation

```
$ ./node_modules/.bin/prisma validate
Error code: P1012
error: Environment variable not found: DATABASE_URL.
  --> prisma/schema.prisma:10
exit 1
```

With a dummy URL supplied in the process environment (no connection attempt):

```
$ DATABASE_URL="file:./prisma/dev.db" prisma validate
The schema at prisma\schema.prisma is valid 🚀
exit 0

$ DATABASE_URL="postgresql://u:p@localhost:5432/db" \
  prisma validate --schema prisma/schema.postgres.prisma
The schema at prisma\schema.postgres.prisma is valid 🚀
exit 0
```

**Interpretation.** Both schemas parse and validate. The repository ships no
`.env` (only `.env.production.example`), so every command that touches Prisma
fails out of the box on a fresh checkout. This is an onboarding defect, not a
schema defect.

---

## 6. Docker Compose

```
$ docker compose -f deploy/docker/docker-compose.yml config --quiet
error while interpolating services.api.environment.AI_ENCRYPTION_KEY:
  required variable AI_ENCRYPTION_KEY is missing a value
error while interpolating services.postgres.environment.POSTGRES_PASSWORD:
  required variable MVMP_DB_PASSWORD is missing a value
error while interpolating services.redis.command.[]:
  required variable MVMP_REDIS_PASSWORD is missing a value
exit 1
```

Two separate problems:

1. **Missing environment file.** Expected on a developer machine; the repository
   provides `deploy/docker/docker-compose.env.example` and
   `deploy/docker/shared-production.env.example`. This alone would be a
   configuration-time failure, not a defect.
2. **Broken build context.** `deploy/docker/docker-compose.yml:103` sets
   `build.context: ..`, which resolves relative to the compose file to
   `deploy/`. The Dockerfile is at the repository root (`./Dockerfile`); there is
   no `deploy/Dockerfile`. A build therefore fails with "Dockerfile not found"
   even with a complete env file. Confirmed by file listing.

Additionally, `deploy/docker/docker-compose.yml:203` publishes the realtime
service as `127.0.0.1:3005:3003`, while `deploy/nginx/mvmp.conf:22` proxies to
`127.0.0.1:3003`, and no `REALTIME_EMIT_URL` is passed to the API container. The
API therefore cannot reach the emit endpoint that the design assumes.

**Interpretation.** `docker compose config` cannot be used as a Gate 1 gate until
the env file exists. The build-context and port defects are static and belong to
WP-16a-1 (code-only, no migration).

---

## 7. Dependency audit

```
$ bun audit
55 vulnerabilities (4 critical, 24 high, 23 moderate, 4 low)
```

Critical advisories — all in Next.js 16.1.1:

| Advisory | Description | Fixed in |
|---|---|---|
| GHSA-p293-qw3h-jr36 | Unauthenticated RCE on Windows-hosted servers | 16.3.3 |
| GHSA-2xp9-vwfh-vxw4 | Unauthenticated RCE in Image Optimization (AVIF) | 16.3.3 |
| GHSA-2464-fhr4-w9xw | Unauthenticated RCE in Image Optimization (SVG) | 16.4.0 |
| GHSA-673q-mjm6-r5xr | Unauthenticated RCE in `use cache` returning typed arrays | 16.4.0 |

High-severity examples: SSRF in image optimization
(GHSA-cjq9-62q9-8jv4), DoS in App Router server actions
(GHSA-p3m5-59mp-jv5r), `sharp`/libvips/libheif/librsvg issues
(GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w), and PostCSS
arbitrary file read (GHSA-6g55-p6wh-862q).

**Interpretation.** Four unauthenticated RCE advisories in the web framework are
a production emergency independent of the application code. The upgrade is a
dependency change, prohibited at Gate 0 and too risky to bundle into a security
refactor. It must be its own scheduled change with a full build and smoke test.
`bun audit fix` was **not** run.

---

## 8. Test and CI inventory

| Artifact | Present |
|---|---|
| `test` script in `package.json` | no |
| `typecheck` script | no |
| vitest / jest config | no |
| Playwright / Cypress config | no |
| `tests/`, `test/`, `__tests__/`, `e2e/` | no |
| `.github/workflows` | no |
| Ad-hoc scripts in `scripts/` | yes — `test-provision.js`, `test-delete.js`, `test-enterprise-settings.js`, `check-*.js`, `db-check.js` |

The ad-hoc scripts are manual probes that print to stdout, require a live
database, and assert nothing. They cannot serve as a regression gate.

**Interpretation.** Test harness readiness is **NOT AVAILABLE**. Gate 1 must
create the runner before it edits authorization code; otherwise "no regression"
cannot be demonstrated.

---

## 9. Environment inventory

| Item | State |
|---|---|
| `.env` | absent (only `.env.production.example`) |
| `prisma/*.db` | absent |
| Redis | not running locally (no evidence of a listener) |
| `node_modules` | present |
| `.next/` | present but stale; rebuild fails at prerender |
| Git metadata | absent — no `.git`, so no diff or blame available |

**Consequence:** no runtime check of any API route was possible during Gate 0.
Every status in `01_DONE_P0_VERIFICATION.md` is static analysis. This is
recorded as G0-F-08 and is the main reason the final decision is conditional
rather than a clean PASS.
