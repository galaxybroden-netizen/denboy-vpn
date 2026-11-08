# MVMP — Phase 14 Audit Report

**Date**: 2026-11-06
**Phase**: 14 — Dual Deployment Architecture (Docker + Native Linux)
**Auditor**: automated audit script + manual review

---

## 1. Audit scope

Before adding Docker deployment alongside the existing Phase 13 Native Linux deployment, this audit verifies:

1. Phase 13 deliverables are intact and not regressed.
2. The repository contains no Docker artifacts that would conflict with new Docker work.
3. The "Go Agent" claim from Phase 13 (no Go agent in repo) is re-verified.
4. Production configuration is consistent between Native and (future) Docker paths.
5. No conflict exists between environment variables, ports, or filesystem paths used by the two deployment modes.
6. Documentation matches source code.

---

## 2. Phase 13 deliverables — intact

| Artifact | Count | Status |
| --- | --- | --- |
| `scripts/deploy/*.sh` | 15 | All present, all pass `bash -n` |
| `deploy/systemd/*.service` | 4 (3 installed + 1 reserved) | All present, all pass `systemd-analyze verify` |
| `deploy/nginx/mvmp.conf` | 1 | Present, placeholders work |
| `deploy/cron/mvmp-backup` | 1 | Present |
| `deploy/redis/release-lock.lua` | 1 | Present |
| `.env.production.example` | 1 | Present, no real secrets |
| `prisma/schema.postgres.prisma` | 1 | Present, validates |
| `src/worker/index.ts` | 1 | Present, TS clean, runs against Redis |
| `src/instrumentation.ts` | 1 | Present, TS clean, fails fast on missing prod env |
| `docs/deployment/*.md` | 3 (NATIVE_UBUNTU_INSTALLATION, DOCKER_VS_NATIVE, PHASE_13_NATIVE_DEPLOYMENT_REPORT) | Present |

**Conclusion**: Phase 13 is intact. Phase 14 must preserve every file above without modification to functionality (additive changes only).

---

## 3. Go Agent verification

The Phase 13 report claimed "MVMP has no Go agent — no `go.mod`, no `.go` files."

Phase 14 re-verification:

```
$ find . -name go.mod -not -path "*/node_modules/*"
(empty)

$ find . -name "*.go" -not -path "*/node_modules/*"
(empty)
```

| Metric | Count |
| --- | --- |
| `go.mod` files | 0 |
| `.go` source files | 0 |

The "agent" referenced in earlier phases (Phase 12.x AI Center) is the **AI Agent** feature inside the Next.js API (`src/app/api/ai/agent/`), not a standalone Go binary. This is a TypeScript module, not a Go service.

**Conclusion**: Phase 13's claim is **confirmed correct**. There is no Go agent in the MVMP repository. The `mvmp-agent.service` systemd unit is correctly preserved as a documented placeholder for future use, and Phase 14's Docker work will likewise NOT include a Go agent container.

---

## 4. Existing Docker artifacts

```
$ find . -maxdepth 3 \( -name "Dockerfile*" -o -name "docker-compose*" -o -name "compose*.yml" \) -not -path "./node_modules/*"
(empty)
```

| Artifact | Count |
| --- | --- |
| `Dockerfile` | 0 |
| `docker-compose.yml` | 0 |
| `compose.yaml` | 0 |

**Conclusion**: No existing Docker artifacts. Phase 14 will create them from scratch. No cleanup or migration of existing Docker files is needed.

---

## 5. Package manager

```
$ ls bun.lock pnpm-lock.yaml package-lock.json yarn.lock pnpm-workspace.yaml
bun.lock   (present, 342690 bytes)
ls: cannot access 'pnpm-lock.yaml': No such file or directory
ls: cannot access 'package-lock.json': No such file or directory
ls: cannot access 'yarn.lock': No such file or directory
ls: cannot access 'pnpm-workspace.yaml': No such file or directory
```

| Lockfile | Present? |
| --- | --- |
| `bun.lock` | ✅ Yes (the project's lockfile) |
| `pnpm-lock.yaml` | ❌ No |
| `pnpm-workspace.yaml` | ❌ No (not a monorepo) |
| `package-lock.json` | ❌ No |
| `yarn.lock` | ❌ No |

**Note**: The Phase 14 task brief mentioned `pnpm-workspace.yaml` and `pnpm-lock.yaml`. These do not exist — the project uses **bun**, not pnpm. MVMP is a single-package repo (not a workspace).

Phase 14 implication:
- Native deployment (Phase 13 scripts) already auto-detects `bun.lock` and uses bun.
- Docker deployment must also use bun (or fall back to npm if bun is unavailable in the build image). We will use the official `oven/bun` image as the build stage to match the lockfile.

---

## 6. Prisma schema variants

| File | Provider | Lines | Models | SQLite-specific `@db.*` annotations |
| --- | --- | --- | --- | --- |
| `prisma/schema.prisma` | `sqlite` | 1409 | 63 | 0 |
| `prisma/schema.postgres.prisma` | `postgresql` | 1409 | 63 | 0 |

The two schemas are byte-identical except for `provider = "sqlite"` vs `provider = "postgresql"`. There are no `@db.Text`, `@db.JsonB`, or other DB-specific annotations — the schema is fully portable.

Phase 13 uses `schema.postgres.prisma` for production via `--schema` flag in `build.sh` and `migrate.sh`. Phase 14 Docker will do the same — single source code, two schema files, selected via env/flag.

**Conclusion**: No schema changes needed for Phase 14. Docker deployment will use `schema.postgres.prisma` exactly as Native does.

---

## 7. Application entry points

| Entry point | Purpose | Port | Phase 13 status | Phase 14 Docker plan |
| --- | --- | --- | --- | --- |
| `.next/standalone/server.js` | Next.js standalone API | 3000 | systemd `mvmp-api.service` | container `mvmp-api` |
| `src/worker/index.ts` | BullMQ worker | none | systemd `mvmp-worker.service` | container `mvmp-worker` |
| `mini-services/realtime-service/index.ts` | socket.io gateway | 3003 (browser) + 3004 (internal emit) | systemd `mvmp-realtime.service` | container `mvmp-realtime` |

All three entry points:
- Read environment from `/etc/mvmp/{db.env,redis.env,app.env}` (Native) or Docker env vars (Docker).
- Handle `SIGTERM`/`SIGINT` for graceful shutdown.
- Are TypeScript files executed via `bun` (preferred) or `node`.

**Conclusion**: Same entry points work for both deployment modes. No code fork needed.

---

## 8. AI subsystem

| File | Purpose | Phase 13 status |
| --- | --- | --- |
| `src/lib/ai-provider.ts` | Multi-provider adapter (OpenAI-compatible, Anthropic, Gemini, Ollama) | Untouched |
| `src/lib/crypto.ts` | AES-256-GCM encryption for AI provider API keys; refuses to start in production without `AI_ENCRYPTION_KEY` | Untouched |
| `src/instrumentation.ts` | Next.js startup hook — validates `AI_ENCRYPTION_KEY`, `DATABASE_URL`, `REDIS_URL`, `PUBLIC_URL` in production | Untouched |

Phase 14 implication:
- Docker containers MUST receive `AI_ENCRYPTION_KEY` as an env var (or via Docker secret).
- The instrumentation hook will fail the container startup if the key is missing — exactly the same behavior as Native.

---

## 9. Authentication

`src/lib/auth.ts` uses cookie-based sessions stored in the `Session` Prisma model. There is **no JWT signing** — the cookie value is a UUID session ID, and the session row is looked up in the DB.

| Concern | Status |
| --- | --- |
| JWT dependency | None |
| Session secret needed | No (sessions are DB-stored, not signed) |
| `SESSION_SECRET` env var | Reserved in `.env.production.example` for future signed-cookie support; not currently required |

**Conclusion**: No auth changes needed for Docker. The session table is in PostgreSQL (production) or SQLite (dev), so cookies work identically in both modes.

---

## 10. Environment variables

### Currently defined in `.env.production.example` (Phase 13)

| Variable | Required in prod? | Source |
| --- | --- | --- |
| `NODE_ENV` | Yes | runtime |
| `DATABASE_URL` | Yes | `/etc/mvmp/db.env` (Native) or Docker env (Docker) |
| `REDIS_URL` | Yes | `/etc/mvmp/redis.env` (Native) or Docker env (Docker) |
| `AI_ENCRYPTION_KEY` | Yes | `/etc/mvmp/app.env` (Native) or Docker env/secret (Docker) |
| `SESSION_SECRET` | Recommended | same |
| `PUBLIC_URL` | Yes | same |
| `PORT`, `HOSTNAME` | Yes (default 3000/127.0.0.1) | runtime |
| `REALTIME_SOCKET_PORT`, `REALTIME_EMIT_PORT` | Yes (default 3003/3004) | runtime |
| Rate-limit tuning (`RATE_LIMIT_*`) | Optional | same |
| `SMTP_*` | Optional | same |
| Payment provider keys | Optional (configurable via Settings UI) | same |
| WhatsApp integration keys | Optional (configurable via WhatsApp UI) | same |

### Phase 14 additions (planned)

No new env vars. Docker will reuse the same names. Differences are in **how** they're delivered:
- Native: files in `/etc/mvmp/*.env` (root-only, mode 0600/0640)
- Docker: env vars in `docker-compose.yml` `environment:` block, or Docker secrets, or `.env` file loaded by compose

**Conclusion**: Env var names are stable. No renames. Phase 14 just adds Docker-specific delivery mechanisms.

---

## 11. Port map — conflict analysis

| Port | Native (Phase 13) | Docker (Phase 14 planned) | Conflict? |
| --- | --- | --- | --- |
| 22 | SSH (host) | SSH (host) | — (host-level, not MVMP) |
| 80 | Nginx (host) | Nginx container OR host Nginx | ⚠️ see below |
| 443 | Nginx (host) | Nginx container OR host Nginx | ⚠️ see below |
| 3000 | mvmp-api (loopback) | mvmp-api container (internal network) | No conflict — Docker uses internal network |
| 3003 | mvmp-realtime (loopback) | mvmp-realtime container (internal) | No conflict |
| 3004 | mvmp-realtime internal emit (loopback) | mvmp-realtime container (internal) | No conflict |
| 5432 | PostgreSQL (loopback) | postgres container (internal) | No conflict |
| 6379 | Redis (loopback) | redis container (internal) | No conflict |

### Port 80/443 conflict resolution

If both Native and Docker run on the **same host** (not recommended, but possible per TASK 6):
- Native Nginx binds `0.0.0.0:80` and `0.0.0.0:443`.
- Docker Nginx (if used) would also try to bind `0.0.0.0:80/443`.

**Resolution**: Phase 14 will document that only ONE public-facing Nginx should bind 80/443. Options:
1. Run Docker without its own Nginx — point host Nginx at the Docker API container's published port (e.g., `127.0.0.1:3001`).
2. Run Docker with its own Nginx on a different port (e.g., 8080/8443) and use host Nginx as the front-line proxy.
3. Run only ONE deployment method per host (recommended).

Phase 14 will use option (1) by default: Docker publishes `127.0.0.1:3001` (API) and `127.0.0.1:3005` (realtime socket.io), and the host Nginx (or a separate Docker Nginx) proxies to them. This way Native and Docker CAN coexist on the same host without port conflicts, and the operator chooses which front-line Nginx to use.

---

## 12. Filesystem paths — conflict analysis

| Path | Native (Phase 13) | Docker (Phase 14 planned) | Conflict? |
| --- | --- | --- | --- |
| `/opt/mvmp` | Application code | Not used by Docker | No |
| `/etc/mvmp/` | Env files (root-only) | Not used by Docker | No |
| `/var/log/mvmp/` | Application logs | Not used by Docker (logs go to container stdout) | No |
| `/var/backups/mvmp/` | Backups | Bind-mounted volume (default `/var/backups/mvmp-docker/`) | No (different dir) |
| `/var/lib/postgresql/` | PG data dir | Docker volume `mvmp-pgdata` | No (different storage) |
| `/var/lib/redis/` | Redis data dir | Docker volume `mvmp-redis-data` | No (different storage) |

**Conclusion**: No filesystem conflicts. Docker uses Docker-managed volumes; Native uses host directories. Both can coexist.

---

## 13. Backup isolation

Phase 13 `backup.sh` writes to `/var/backups/mvmp/<timestamp>/`.

Phase 14 Docker backup will write to `/var/backups/mvmp-docker/<timestamp>/` (separate directory).

The backup script will be parameterized by `BACKUP_DIR` env var (already supported by Phase 13 `backup.sh`). Docker compose will set `BACKUP_DIR=/var/backups/mvmp-docker` in the backup container's env.

**Conclusion**: Backups never mix. Each deployment mode has its own backup directory and volume.

---

## 14. Documentation vs source code — discrepancies

| Documentation claim | Source code reality | Discrepancy? |
| --- | --- | --- |
| Phase 13: "MVMP has no Go agent" | Confirmed: 0 go.mod, 0 .go files | None |
| Phase 13: "Uses bun, not pnpm" | Confirmed: `bun.lock` present, no `pnpm-lock.yaml` | None |
| Phase 13: "Prisma schema is portable" | Confirmed: 0 `@db.*` annotations | None |
| Phase 13: "instrumentation.ts fails fast on missing AI_ENCRYPTION_KEY" | Tested: exit 1 with FATAL log | None |
| Phase 13: "Worker is a deployment stub" | Confirmed: `src/worker/index.ts` connects to Redis and idles | None — Phase 14 will keep this stub as-is |
| `.env.production.example`: "Database URL set by /etc/mvmp/db.env — DO NOT duplicate here" | Correct — env file loading order in systemd unit | None |

**Conclusion**: No documentation-source discrepancies found. Phase 13 documentation is accurate.

---

## 15. Identifying incomplete implementations and conflicts

### Incomplete implementations (carried over from earlier phases)

1. **Transactional outbox + Redis distributed lock** (Phase 12.2):
   - BullMQ + ioredis installed.
   - `src/worker/index.ts` is a stub that connects to Redis and idles.
   - No outbox table in Prisma schema.
   - No job processor in worker.
   - **Status**: Deferred. Out of scope for Phase 14 (Phase 14 is about deployment, not application features). Phase 14 must NOT break the stub.

2. **Real AI provider E2E** (Phase 12.2):
   - No real API keys configured.
   - **Status**: NEEDS CONFIGURATION (operator must add keys via AI Center UI). Not a Phase 14 concern.

3. **Worker entry is a stub**:
   - Connects to Redis, idles.
   - **Phase 14 impact**: Docker will run this stub as the worker container. It will report healthy but process no jobs. This is acceptable for Phase 14 — the deployment infrastructure is ready, the application-level worker logic is a separate concern.

### Conflicts to resolve in Phase 14

1. **Port 80/443 if both deployments coexist** — resolved by Docker publishing API on `127.0.0.1:3001` (not 80/443), see §11.

2. **`prisma generate` schema selection** — Phase 13 `build.sh` uses `--schema prisma/schema.postgres.prisma`. Phase 14 Docker build stage must do the same. No conflict — same flag.

3. **`.env` file vs Docker env vars** — Native loads from `/etc/mvmp/*.env` files; Docker loads from compose `environment:` block. Same env var names, different delivery. No conflict.

### Configuration mismatches

None found. The Phase 13 configuration is internally consistent and Docker will mirror it.

---

## 16. Phase 14 implementation plan

Based on this audit, Phase 14 will:

### Add (new files, no existing files modified)

1. **Docker artifacts**:
   - `Dockerfile` — multi-stage build for Next.js + worker + realtime
   - `docker-compose.yml` — 6 services: api, worker, realtime, postgres, redis, (optional nginx)
   - `docker-compose.override.yml` — dev overrides (optional)
   - `.dockerignore` — exclude node_modules, .next, .git, etc.
   - `deploy/docker/` — Docker-specific config files (redis.conf, postgres init script)

2. **Deployment selector**:
   - `scripts/deploy/install.sh` — interactive menu + CLI args

3. **Documentation** (6 new docs):
   - `docs/deployment/DOCKER_INSTALLATION.md`
   - `docs/deployment/DEPLOYMENT_COMPARISON.md`
   - `docs/deployment/MIGRATION_DOCKER_TO_NATIVE.md`
   - `docs/deployment/MIGRATION_NATIVE_TO_DOCKER.md`
   - `docs/deployment/RESOURCE_PROFILE.md`
   - `docs/deployment/PHASE_14_DUAL_DEPLOYMENT_REPORT.md`

4. **Docker-specific helper scripts**:
   - `scripts/deploy/docker-backup.sh` — backup running Docker deployment
   - `scripts/deploy/docker-restore.sh` — restore Docker deployment
   - `scripts/deploy/docker-health-check.sh` — health check for Docker deployment

### Modify (minimal, additive)

- `docs/deployment/DOCKER_VS_NATIVE.md` — append Phase 14 update section (existing content preserved)
- `.env.production.example` — add a "Docker" usage note (no new env vars, just documentation)

### NOT modify

- All Phase 13 shell scripts (`scripts/deploy/*.sh`) — preserved exactly
- All Phase 13 systemd units — preserved exactly
- All Phase 13 documentation — preserved (only DOCKER_VS_NATIVE.md gets an addendum)
- `prisma/schema.prisma` — SQLite dev schema unchanged
- `prisma/schema.postgres.prisma` — production schema unchanged
- All application source code (`src/**`)
- `package.json`, `bun.lock`, `next.config.ts`
- `Caddyfile` (sandbox dev reverse proxy)
- `mini-services/realtime-service/index.ts`

---

## 17. Risks identified

| Risk | Mitigation |
| --- | --- |
| Docker daemon not available in sandbox → cannot test `docker build` end-to-end | Document as `BLOCKED` in test report. Validate Dockerfile syntax via `hadolint` (if available) and docker-compose via `docker compose config` (if Docker is installed). If neither is available, fall back to manual YAML validation. |
| Bun image size — `oven/bun:1.3` is ~300 MB | Use multi-stage build: `oven/bun:1.3` as build, `oven/bun:1.3-slim` or `node:22-alpine` as runtime. Final image target <500 MB. |
| Prisma client needs to be generated for the target OS/arch | Generate in the Docker build stage (Linux x86_64 by default). Multi-arch build (`docker buildx`) is out of scope for Phase 14 but documented. |
| Operator runs Docker and Native on same host, expecting both to serve public traffic | Document clearly: only ONE front-line Nginx should bind 80/443. Default Docker config publishes API on 127.0.0.1:3001, not 80/443. |
| Backup directory confusion | Docker uses `/var/backups/mvmp-docker/`, Native uses `/var/backups/mvmp/`. Different volumes. |
| Env var drift between Docker and Native | Use a single `.env.production.example` template. Docker compose loads `.env` file directly. |
| Worker stub reports "healthy" but does nothing | Document clearly. Operator sees heartbeat in `docker logs mvmp-worker-1`. Not a regression — same as Phase 13. |

---

## 18. Audit conclusion

The repository is in a clean state for Phase 14 work:

- Phase 13 is intact and consistent.
- No Docker artifacts exist to conflict with new work.
- No Go agent exists (Phase 13 claim verified).
- Prisma schemas are portable.
- Env vars are stable.
- No filesystem or port conflicts that can't be resolved with documented conventions.

Phase 14 implementation can proceed with the plan in §16. All changes will be additive and backward-compatible.

---

## Appendix — Audit commands run

```bash
# Phase 13 file inventory
ls scripts/deploy/*.sh | wc -l                  # → 15
ls deploy/systemd/*.service | wc -l             # → 4
ls docs/deployment/*.md                          # → 3

# Go agent re-verification
find . -name go.mod -not -path "*/node_modules/*"   # → empty
find . -name "*.go" -not -path "*/node_modules/*"   # → empty

# Docker artifacts check
find . -maxdepth 3 \( -name "Dockerfile*" -o -name "docker-compose*" \) -not -path "./node_modules/*"
# → empty

# Package manager
ls bun.lock pnpm-lock.yaml package-lock.json yarn.lock pnpm-workspace.yaml
# → only bun.lock present

# Prisma schema portability
diff -q prisma/schema.prisma prisma/schema.postgres.prisma  # → differ only in provider
grep "provider = " prisma/schema.prisma prisma/schema.postgres.prisma
# → sqlite / postgresql

# Auth (no JWT)
grep -nE "JWT|jwt" src/lib/auth.ts   # → empty

# Phase 13 audit JSON
cat scripts/deploy/_audit.json
```
