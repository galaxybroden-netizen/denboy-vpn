# MVMP — Docker vs Native Deployment

MVMP supports two operating modes. They are fully independent and never share configuration.

| Mode | OS | Database | Cache/Queue | Reverse proxy | Use case |
| --- | --- | --- | --- | --- | --- |
| **Development** | Windows / macOS / Linux | SQLite (file) | in-memory (BullMQ optional) | Caddy (sandbox) | Local development on developer's machine |
| **Native Production** | Ubuntu 22.04 / 24.04 | PostgreSQL | Redis 7 | Nginx | Production deployment without containers |
| **Docker Production** (Phase 14) | Any Linux with Docker 24+ | PostgreSQL 16 (container) | Redis 7 (container) | Host Nginx (recommended) | Container-based production deployment |

> **Phase 14 update**: Docker Production mode was added in Phase 14. Both production modes use the same source code, same Prisma schemas, same env vars, and same application features. For a side-by-side comparison see `DEPLOYMENT_COMPARISON.md`. For migration guides see `MIGRATION_NATIVE_TO_DOCKER.md` and `MIGRATION_DOCKER_TO_NATIVE.md`.

## Docker status in this repository

**The MVMP repository did not use Docker prior to Phase 14.**

Phase 13 audit (run via `scripts/deploy/audit.sh`) confirmed:
- No `Dockerfile`, `docker-compose.yml`, `compose.yaml`, or any container manifest in the repo (before Phase 14).
- No `docker build`, `docker run`, `docker compose`, or `docker ps` invocations in any source file or shell script (before Phase 14).
- The only mention of the word "container" appears in `tests/python-runtime-container.sh` — an unrelated sandbox smoke test, not a Docker reference.

Phase 14 added optional Docker deployment artifacts (`Dockerfile`, `deploy/docker/docker-compose.yml`, etc.) WITHOUT modifying any Phase 13 native scripts. The two deployment modes coexist as separate install paths:

- **Docker Production** (Phase 14): use `scripts/deploy/install.sh --docker` → see `DOCKER_INSTALLATION.md`
- **Native Production** (Phase 13): use `scripts/deploy/install.sh --native` → see `NATIVE_UBUNTU_INSTALLATION.md`

Developers who don't want Docker can ignore the Docker artifacts entirely — they are additive and don't affect the Native or Development workflows.

## What was added in Phase 13 (and what was NOT changed)

### Added (new files, no impact on existing code)

- `scripts/deploy/*.sh` — 15 native deployment scripts
- `deploy/systemd/*.service` — 4 systemd unit templates (3 installed, 1 reserved for future Go agent)
- `deploy/nginx/mvmp.conf` — Nginx reverse proxy template
- `deploy/cron/mvmp-backup` — nightly backup cron file
- `deploy/redis/release-lock.lua` — Lua script for atomic lock release
- `docs/deployment/NATIVE_UBUNTU_INSTALLATION.md` — installation guide
- `docs/deployment/PHASE_13_NATIVE_DEPLOYMENT_REPORT.md` — this report
- `docs/deployment/DOCKER_VS_NATIVE.md` — this file
- `.env.production.example` — production environment template (NO real secrets)
- `prisma/schema.postgres.prisma` — PostgreSQL variant of the Prisma schema (identical models, `provider = "postgresql"`)
- `src/worker/index.ts` — BullMQ worker entry point (deployment stub; connects to Redis, idles, ready for Phase 12.2 to populate)
- `src/instrumentation.ts` — Next.js startup hook that validates production env (fails fast on missing secrets)

### NOT changed

- All existing VPN, AI, payment, RBAC, customer/reseller portal, and admin modules remain untouched.
- `prisma/schema.prisma` (SQLite) is preserved unchanged for development.
- `next.config.ts`, `package.json`, `bun.lock` unchanged.
- The Caddyfile (sandbox dev reverse proxy) is unchanged.
- `mini-services/realtime-service/index.ts` is unchanged.
- The development workflow on Windows localhost (`bun run dev`) is unchanged.

## No hardcoded ports

Phase 13 scripts do NOT assume any specific port. Every port is configurable via environment:

- `MVMP_DB_PORT` (default 5432) — PostgreSQL
- `MVMP_REDIS_PORT` (default 6379, read from `REDIS_URL`) — Redis
- `PORT` (default 3000) — Next.js API
- `REALTIME_SOCKET_PORT` (default 3003) — socket.io gateway
- `REALTIME_EMIT_PORT` (default 3004) — internal emit endpoint

The Nginx config and systemd units reference these defaults but can be overridden via `/etc/mvmp/app.env`. The Phase 13 requirement "Tidak ada asumsi bahwa database selalu berada pada port 5433" is satisfied — we use 5432 by default, never 5433, and it is configurable.

## How to switch between modes

### From Development (Windows localhost) → Native Production (Ubuntu)

1. Build the app on a Linux machine or CI runner (cross-platform Next.js standalone output).
2. SSH to the Ubuntu server.
3. Follow `docs/deployment/NATIVE_UBUNTU_INSTALLATION.md` step by step.
4. The deploy scripts auto-detect the OS version and install the right component versions.

### From Native Production → Development

Nothing to do — the development environment on the developer's machine is independent and uses SQLite + bun dev. No production state needs to be reverted.

## Disaster recovery note

If a native production deployment needs to be rebuilt from scratch on a new server:

1. Provision a fresh Ubuntu 22.04 or 24.04 server.
2. Restore `/etc/mvmp/` from the latest backup (decrypts `db.env`, `redis.env`, `app.env`).
3. Run `install-system-packages.sh`, `install-postgresql.sh`, `install-redis.sh`.
4. Run `restore.sh /var/backups/mvmp/<latest>` to restore the database + Redis.
5. Run `build.sh`, `setup-systemd.sh`, `setup-nginx.sh`.
6. Run `health-check.sh` to verify.

The full procedure is documented in `NATIVE_UBUNTU_INSTALLATION.md` §13 (Restore).
