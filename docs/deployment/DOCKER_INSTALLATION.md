# MVMP — Docker Installation Guide (Phase 14)

This guide walks an operator through deploying MVMP via Docker Compose on Ubuntu 22.04 / 24.04 (or any host with Docker Engine + Compose v2).

For the Native Linux alternative, see `NATIVE_UBUNTU_INSTALLATION.md`. For a side-by-side comparison, see `DEPLOYMENT_COMPARISON.md`.

---

## 0. Prerequisites

- Docker Engine 24+ with Compose v2 plugin
- A Linux host (Ubuntu 22.04/24.04 recommended; any modern Linux works)
- 4 CPU / 4 GB RAM minimum (see `RESOURCE_PROFILE.md`)
- 20 GB free disk
- A registered domain pointing at the host (for HTTPS)
- The MVMP repository cloned to `/opt/mvmp` (or any directory)

### Install Docker Engine (if not present)

```bash
# Ubuntu 22.04 / 24.04
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# log out + back in for group change to take effect

# Verify
docker --version              # Docker version 24+
docker compose version        # Docker Compose version v2+
```

---

## 1. Clone the repository

```bash
sudo mkdir -p /opt/mvmp
sudo chown "$USER":"$USER" /opt/mvmp
git clone <your-repo-url> /opt/mvmp
cd /opt/mvmp
```

---

## 2. Configure environment

```bash
cp deploy/docker/docker-compose.env.example .env
chmod 600 .env
```

Edit `.env` and fill in real values for the required secrets:

```bash
nano .env
```

Required secrets (generate with the commands shown):

| Variable | Generator |
| --- | --- |
| `AI_ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `MVMP_DB_PASSWORD` | `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"` |
| `MVMP_REDIS_PASSWORD` | `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"` |
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |

Also set:
- `PUBLIC_URL=https://mvmp.your-domain.com`

The application refuses to start in production if `AI_ENCRYPTION_KEY` is missing or invalid. This is enforced by `src/instrumentation.ts` and `src/lib/env-validate.ts`.

---

## 3. Validate docker-compose config

```bash
docker compose -f deploy/docker/docker-compose.yml config
```

This parses the compose file, interpolates env vars, and prints the resolved config. If it prints without errors, the config is valid.

Expected output: a YAML document showing all 6 services (`postgres`, `redis`, `api`, `worker`, `realtime`, `backup`), the `mvmp-net` network, and the three volumes.

---

## 4. Build the MVMP image

```bash
docker compose -f deploy/docker/docker-compose.yml build api
```

The build:
1. Uses `oven/bun:1.3-debian` as the base image (slim, glibc — required for `sharp` native bindings)
2. Installs dependencies via `bun install --frozen-lockfile`
3. Generates the Prisma client for PostgreSQL (`prisma/schema.postgres.prisma`)
4. Runs `next build` to produce `.next/standalone/server.js`
5. Copies artifacts into a minimal runtime image
6. Creates non-root user `mvmp` (uid 1001)
7. Installs `tini` as PID 1 for proper signal forwarding

Expected build time: 3–5 minutes on a 4 CPU host. Image size: ~600 MB.

The same image is used by the `api`, `worker`, and `realtime` containers — they differ only in `command:` and env vars.

---

## 5. Start the services

```bash
docker compose -f deploy/docker/docker-compose.yml up -d postgres redis
# Wait for postgres + redis to be healthy (10–15 seconds)
docker compose -f deploy/docker/docker-compose.yml up -d
```

Verify:

```bash
docker compose -f deploy/docker/docker-compose.yml ps
```

Expected: all 5 services `running (healthy)`. The `backup` service does NOT show because it uses a `backup` profile (only runs on-demand).

---

## 6. Run database migrations

```bash
docker compose -f deploy/docker/docker-compose.yml exec -T api \
  bunx prisma migrate deploy --schema prisma/schema.postgres.prisma
```

This applies all Prisma migrations to the PostgreSQL database. Non-interactive — never prompts.

If no migrations exist yet (fresh install), create the baseline first:

```bash
docker compose -f deploy/docker/docker-compose.yml exec -T api \
  bunx prisma migrate dev --schema prisma/schema.postgres.prisma --name init --create-only --skip-generate
docker compose -f deploy/docker/docker-compose.yml exec -T api \
  bunx prisma migrate deploy --schema prisma/schema.postgres.prisma
```

---

## 7. Configure host Nginx (front-line reverse proxy)

Docker publishes the API on `127.0.0.1:3001` and Realtime on `127.0.0.1:3005` — both loopback only. A front-line Nginx terminates TLS and proxies public 80/443 to these.

### Option A: Use the Phase 13 host Nginx config

If you have host Nginx installed (via `install-system-packages.sh` from Phase 13):

```bash
sudo SERVER_NAME=mvmp.your-domain.com bash scripts/deploy/setup-nginx.sh
```

Then edit `/etc/nginx/sites-available/mvmp.conf` to point at the Docker upstreams:

```nginx
upstream mvmp_api {
    server 127.0.0.1:3001;   # Docker API (was 127.0.0.1:3000 for Native)
    keepalive 32;
}
upstream mvmp_realtime {
    server 127.0.0.1:3005;   # Docker Realtime (was 127.0.0.1:3003 for Native)
    keepalive 16;
}
```

Test + reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Option B: Use a minimal Nginx config for Docker-only deployments

Create `/etc/nginx/sites-available/mvmp.conf` with the upstreams above and the rest of the config from `deploy/nginx/mvmp.conf`. The TLS/security/rate-limit sections are identical.

---

## 8. HTTPS via Let's Encrypt

```bash
sudo certbot --nginx -d mvmp.your-domain.com --redirect
sudo certbot renew --dry-run
```

Certbot updates the Nginx config to use the new cert and sets up auto-renewal via `certbot.timer`.

---

## 9. Configure firewall (UFW)

```bash
sudo bash scripts/deploy/setup-firewall.sh
```

This allows:
- 22 (SSH, rate-limited)
- 80 (HTTP, redirects to 443)
- 443 (HTTPS)

Internal Docker ports (3001, 3005) are NOT opened because they bind to 127.0.0.1.

---

## 10. Set up nightly backups

```bash
sudo cp deploy/docker/backup-cron /etc/cron.d/mvmp-docker-backup
sudo chmod 644 /etc/cron.d/mvmp-docker-backup
sudo systemctl reload cron 2>/dev/null || sudo systemctl reload crond
```

This runs `docker compose --profile backup run --rm backup` nightly at 03:00. The backup lands in the `mvmp_mvmp-backups` Docker volume.

To find the host path of the backup volume:

```bash
docker volume inspect mvmp_mvmp-backups --format '{{ .Mountpoint }}'
# Typical: /var/lib/docker/volumes/mvmp_mvmp-backups/_data
```

---

## 11. Health check

```bash
bash scripts/deploy/docker-health-check.sh
```

Verifies:
- All 5 containers running
- PostgreSQL accepts connections
- Redis responds to PING
- API returns HTTP 200 on `127.0.0.1:3001`
- Realtime `/health` returns 200
- Worker heartbeat present in logs (last 2 minutes)
- Volume disk usage

---

## 12. View logs

```bash
# All services
docker compose -f deploy/docker/docker-compose.yml logs -f --tail=100

# Single service
docker compose -f deploy/docker/docker-compose.yml logs -f api
docker compose -f deploy/docker/docker-compose.yml logs -f worker
docker compose -f deploy/docker/docker-compose.yml logs -f postgres
```

Each service uses the `json-file` driver with rotation (10 MB × 5–10 files). Logs never fill the disk.

---

## 13. Update the application

```bash
cd /opt/mvmp
git pull origin main

# Backup current state
bash scripts/deploy/docker-backup.sh

# Rebuild image
docker compose -f deploy/docker/docker-compose.yml build api

# Apply migrations (non-destructive)
docker compose -f deploy/docker/docker-compose.yml exec -T api \
  bunx prisma migrate deploy --schema prisma/schema.postgres.prisma

# Restart services with the new image
docker compose -f deploy/docker/docker-compose.yml up -d --force-recreate api worker realtime

# Verify
bash scripts/deploy/docker-health-check.sh
```

---

## 14. Rollback

```bash
# List available backups
docker run --rm -v mvmp_mvmp-backups:/backups:ro alpine ls -1 /backups

# Restore from a specific backup
bash scripts/deploy/docker-restore.sh <timestamp>   # e.g. 20260101-030000

# With force (automation)
bash scripts/deploy/docker-restore.sh <timestamp> --force
```

The restore script:
1. Validates the backup exists
2. Takes a SAFETY backup of current state first
3. Stops `api`, `worker`, `realtime` (NOT postgres/redis)
4. Drops + recreates the database
5. Restores from the pg_dump
6. Restarts services
7. Runs health check

---

## 15. Stop / start / remove

```bash
# Stop (keeps containers + volumes)
docker compose -f deploy/docker/docker-compose.yml stop

# Start again
docker compose -f deploy/docker/docker-compose.yml start

# Restart everything
docker compose -f deploy/docker/docker-compose.yml restart

# Remove containers (keeps volumes)
docker compose -f deploy/docker/docker-compose.yml down

# Remove containers AND volumes (DESTRUCTIVE — loses all data)
docker compose -f deploy/docker/docker-compose.yml down -v
```

---

## 16. Troubleshooting

### Container fails to start

```bash
docker compose -f deploy/docker/docker-compose.yml logs api | tail -50
```

Common causes:
- `AI_ENCRYPTION_KEY` not set in `.env` → instrumentation hook exits 1
- `MVMP_DB_PASSWORD` not set → compose refuses to start postgres (the `${VAR:?...}` syntax)
- Image build failed → check `docker compose build api` output

### PostgreSQL connection refused

```bash
docker compose -f deploy/docker/docker-compose.yml ps postgres
# Should be "running (healthy)"

docker compose -f deploy/docker/docker-compose.yml logs postgres | tail -20
```

### Redis auth failed

```bash
docker compose -f deploy/docker/docker-compose.yml exec redis \
  redis-cli -a "$MVMP_REDIS_PASSWORD" --no-auth-warning ping
# Should print PONG
```

### API returns 502 (Nginx can't reach API)

```bash
# Confirm API is listening on the published port
curl -fsS http://127.0.0.1:3001/

# If empty response, the container is starting up — wait 20s and retry
```

### Worker reports unhealthy

```bash
docker compose -f deploy/docker/docker-compose.yml logs worker --tail=50
```

The worker is a stub (Phase 14) — it connects to Redis and emits a heartbeat every 60s. If it reports unhealthy, check that Redis is reachable from inside the worker container:

```bash
docker compose -f deploy/docker/docker-compose.yml exec worker \
  redis-cli -a "$MVMP_REDIS_PASSWORD" -h redis ping
```

### Disk full

```bash
docker system df -v
# Shows images, containers, volumes, and build cache sizes

docker compose -f deploy/docker/docker-compose.yml down --remove-orphans
docker system prune -a --volumes
# WARNING: removes ALL unused Docker data, not just MVMP
```

Reduce backup retention in `.env`:

```
BACKUP_RETENTION_DAYS=7   # default 30
```

### View running config

```bash
docker compose -f deploy/docker/docker-compose.yml config
# Prints the fully-resolved config with env vars interpolated
```

---

## Appendix A — Service map

| Service | Container name | Internal port | Published port | Volume |
| --- | --- | --- | --- | --- |
| `postgres` | `mvmp-postgres-1` | 5432 | NOT published | `mvmp_mvmp-pgdata` |
| `redis` | `mvmp-redis-1` | 6379 | NOT published | `mvmp_mvmp-redis-data` |
| `api` | `mvmp-api-1` | 3000 | `127.0.0.1:3001` | — |
| `worker` | `mvmp-worker-1` | none | NOT published | — |
| `realtime` | `mvmp-realtime-1` | 3003 + 3004 | `127.0.0.1:3005` (3003 only) | — |
| `backup` | one-shot | — | — | `mvmp_mvmp-backups` |

## Appendix B — Common commands

```bash
# Start everything
docker compose -f deploy/docker/docker-compose.yml up -d

# Stop everything (keeps data)
docker compose -f deploy/docker/docker-compose.yml stop

# Status
docker compose -f deploy/docker/docker-compose.yml ps

# Logs (follow)
docker compose -f deploy/docker/docker-compose.yml logs -f

# Health check
bash scripts/deploy/docker-health-check.sh

# Backup
bash scripts/deploy/docker-backup.sh

# Restore
bash scripts/deploy/docker-restore.sh <timestamp>

# Rebuild after code change
docker compose -f deploy/docker/docker-compose.yml build api
docker compose -f deploy/docker/docker-compose.yml up -d --force-recreate api worker realtime

# Run migrations
docker compose -f deploy/docker/docker-compose.yml exec -T api \
  bunx prisma migrate deploy --schema prisma/schema.postgres.prisma

# Shell inside API container
docker compose -f deploy/docker/docker-compose.yml exec api sh
```

## Appendix C — File locations

| File | Purpose |
| --- | --- |
| `Dockerfile` | Multi-stage build for the MVMP image (API + Worker + Realtime) |
| `.dockerignore` | Excludes dev files from build context |
| `deploy/docker/docker-compose.yml` | 6-service compose file |
| `deploy/docker/docker-compose.env.example` | Template for `.env` (copy to `.env`, fill in secrets) |
| `deploy/docker/shared-production.env.example` | Single source of truth for env var names (both Docker + Native) |
| `deploy/docker/postgres/init.sql` | PostgreSQL init script (restricts mvmp role) |
| `deploy/docker/redis/redis.conf` | Redis config (loopback bind, noeviction, AOF+RDB) |
| `deploy/docker/backup-cron` | Cron file for nightly backup |
| `scripts/deploy/install.sh --docker` | Interactive installer / CLI |
| `scripts/deploy/docker-backup.sh` | Trigger a backup |
| `scripts/deploy/docker-restore.sh` | Restore from a backup |
| `scripts/deploy/docker-health-check.sh` | Health check |
