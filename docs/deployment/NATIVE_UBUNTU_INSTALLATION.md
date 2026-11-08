# MVMP — Native Ubuntu Installation Guide

This guide walks an operator through deploying MVMP natively on Ubuntu 22.04 LTS or 24.04 LTS **without Docker**. All components (Node.js, PostgreSQL, Redis, Nginx, MVMP API, MVMP Worker, MVMP Realtime) run as systemd services managed by the OS.

> **Two-mode project**: development on Windows localhost uses SQLite + bun dev server + Caddy. Production on Linux uses PostgreSQL + Redis + systemd + Nginx. The two modes are documented separately; this guide covers production native Linux only.

---

## 0. Pre-flight

Read this section before touching the server.

### 0.1 Required skills

- SSH access to the target Ubuntu server as a user with `sudo` privileges
- Familiarity with `systemctl`, `journalctl`, `psql`, `redis-cli`, `nginx`
- A registered domain name pointing to the server's public IP (for HTTPS)

### 0.2 Project prerequisites

Clone or upload the MVMP repository to `/opt/mvmp`:

```bash
sudo mkdir -p /opt/mvmp
sudo chown "$USER":"$USER" /opt/mvmp
git clone <your-repo-url> /opt/mvmp
cd /opt/mvmp
```

All scripts referenced below live in `scripts/deploy/` and are run from the repo root.

### 0.3 Backup policy

Before any destructive step (schema switch, migration, restore), the deploy scripts take an automatic safety backup. Operators should also configure nightly backups via cron (see §12).

---

## 1. Server preparation (Ubuntu 22.04 and 24.04)

### 1.1 Update the base OS

```bash
sudo apt-get update && sudo apt-get -y upgrade
sudo apt-get -y install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 1.2 Set the hostname and timezone

```bash
sudo hostnamectl set-hostname mvmp01
sudo timedatectl set-timezone Asia/Jakarta  # or your region
```

### 1.3 Run the requirements check

```bash
bash scripts/deploy/check-requirements.sh
```

This validates:
- OS version (must be Ubuntu 22.04 or 24.04)
- CPU (≥ 2 cores), RAM (≥ 4 GB), disk (≥ 10 GB free)
- Architecture (x86_64 or aarch64)
- Network reachability to npm registry + Ubuntu mirrors
- Ports 80 and 443 free for Nginx

If the script reports `[FAIL]` for any item, address it before continuing.

### Differences between 22.04 and 24.04

| Concern | Ubuntu 22.04 | Ubuntu 24.04 |
| --- | --- | --- |
| Default PostgreSQL in apt | 14 | 16 |
| PostgreSQL we install | 15 (from PostgreSQL official repo) | 16 (from PostgreSQL official repo) |
| Default Redis in apt | 6.x (too old) | 7.x |
| Redis we install | 7 (from Redis official repo) | 7 (from Redis official repo) |
| Node.js from NodeSource | 20 LTS | 20 LTS |
| Nginx | 1.18 | 1.24 |
| systemd | 249 | 255 |
| `apt` Python default | Python 3.10 | Python 3.12 |

The deploy scripts auto-detect Ubuntu version and install the correct major release of PostgreSQL (15 for 22.04, 16 for 24.04). All other components are pinned to the same versions on both OSes.

---

## 2. Install native dependencies

```bash
sudo bash scripts/deploy/install-system-packages.sh
```

This installs:
- Node.js 20 LTS (NodeSource official repo)
- bun (because the project uses `bun.lock`)
- PostgreSQL 15/16 (PostgreSQL official apt repo)
- Redis 7 (Redis official apt repo)
- Nginx
- Certbot + nginx plugin
- Build essentials (gcc, g++, make, python3) for native Node addons
- Go (only if `go.mod` is found — current MVMP has no Go agent, so Go is skipped)

The script is **idempotent** — re-running it skips already-installed components.

---

## 3. PostgreSQL setup

```bash
sudo bash scripts/deploy/install-postgresql.sh
```

This script:
1. Ensures PostgreSQL is enabled and running
2. Sets `listen_addresses = '127.0.0.1'` (loopback only — not exposed publicly)
3. Configures `pg_hba.conf` to use `scram-sha-256` for TCP, `peer` for unix sockets
4. Creates a dedicated `mvmp` database user (NOT superuser, NO `CREATEDB`/`CREATEROLE`/`REPLICATION`)
5. Creates the `mvmp` database owned by that user
6. Revokes `PUBLIC` access to the `public` schema; grants only to `mvmp`
7. Generates a strong 32-char password if `MVMP_DB_PASSWORD` is not set
8. Saves the connection string to `/etc/mvmp/db.env` (mode 0600, owner root)
9. Validates the connection works
10. Optionally runs `prisma validate` against `prisma/schema.postgres.prisma`

**Verification:**

```bash
sudo cat /etc/mvmp/db.env  # connection string is here, root-only
sudo -u postgres psql -c "\du mvmp"     # role exists, not superuser
sudo -u postgres psql -c "\l mvmp"      # database exists, owner=mvmp
ss -ltn | grep 5432                     # should show 127.0.0.1:5432 only
```

---

## 4. Redis setup

```bash
sudo bash scripts/deploy/install-redis.sh
```

This script:
1. Enables `redis-server.service` via systemd
2. Binds to `127.0.0.1` and `::1` only (NOT public)
3. Enables `protected-mode`
4. Sets a 32-char password (saved to `/etc/mvmp/redis.env`, mode 0600)
5. Sets `maxmemory 256mb` and `maxmemory-policy noeviction` — **critical: BullMQ jobs are never silently evicted**
6. Enables AOF + RDB persistence
7. Runs 7 verification tests:
   - PING/PONG
   - SET/GET
   - Anonymous access rejected (auth required)
   - Distributed lock (Lua compare-and-delete)
   - TTL expiration
   - Persistence files exist
   - maxmemory-policy is noeviction

**Verification:**

```bash
sudo cat /etc/mvmp/redis.env
redis-cli -a "$(sudo grep MVMP_REDIS_PASSWORD= /etc/mvmp/redis.env | cut -d= -f2)" \
  --no-auth-warning ping
# → PONG
```

---

## 5. Environment configuration

### 5.1 Create the app environment file

```bash
sudo cp .env.production.example /etc/mvmp/app.env
sudo chown root:mvmp /etc/mvmp/app.env
sudo chmod 640 /etc/mvmp/app.env
```

### 5.2 Generate the required secrets

```bash
# AI_ENCRYPTION_KEY — 32-byte AES-256-GCM key, hex-encoded (64 chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# SESSION_SECRET — 48-byte random hex
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Edit `/etc/mvmp/app.env` and set:
- `AI_ENCRYPTION_KEY` (REQUIRED in production — app refuses to start without it)
- `SESSION_SECRET`
- `PUBLIC_URL=https://your-domain.example.com`
- `SMTP_*` if you want email

### 5.3 Validate at startup

The `src/instrumentation.ts` Next.js hook runs on server startup and validates:
- `NODE_ENV=production`
- `AI_ENCRYPTION_KEY` present + correct length
- `DATABASE_URL` present
- `REDIS_URL` present
- `PUBLIC_URL` present

If any required variable is missing, the process **exits with status 1** during startup — no silently degraded operation.

---

## 6. Database migration

The repository ships with two Prisma schemas:
- `prisma/schema.prisma` — SQLite (development)
- `prisma/schema.postgres.prisma` — PostgreSQL (production, identical models, different `provider`)

To apply the schema to PostgreSQL:

```bash
cd /opt/mvmp
sudo bash scripts/deploy/migrate.sh
```

This script:
1. Loads `DATABASE_URL` from `/etc/mvmp/db.env`
2. Pre-flight: validates Prisma can connect to PostgreSQL
3. Creates a baseline migration if none exists
4. Runs `prisma migrate deploy` (non-interactive — never prompts)
5. Regenerates the Prisma client

**Important**: `migrate.sh` does NOT run `prisma migrate reset` and does NOT use `--accept-data-loss`. Both are explicitly forbidden in production.

---

## 7. Build the application

```bash
cd /opt/mvmp
bash scripts/deploy/build.sh
```

This script:
1. Detects the package manager (bun > pnpm > npm) and uses the correct one
2. Installs dependencies from the lockfile
3. Validates production env (only when `NODE_ENV=production`)
4. Runs `prisma generate` against `schema.postgres.prisma`
5. Runs `next build` (produces `.next/standalone/server.js`)
6. Copies static assets into `.next/standalone/.next/static`
7. Installs realtime service dependencies (`mini-services/realtime-service`)
8. Builds the Go agent IF `go.mod` is found (current MVMP has no Go agent — skipped)
9. Validates every required artifact exists

**Outputs:**
- `.next/standalone/server.js` — Next.js standalone API server
- `.next/standalone/.next/static/` — frontend static assets
- `.next/standalone/public/` — public files (logo, robots.txt)
- `node_modules/.prisma/client/` — generated Prisma client
- `mini-services/realtime-service/index.ts` — ready to run via bun

The build script is **separated** from migration and deployment per Phase 13 requirements.

---

## 8. systemd services

### 8.1 Create dedicated user

```bash
sudo bash scripts/deploy/create-user.sh
```

Creates:
- System user `mvmp` (no login shell, no password, in `mvmp` group)
- Home: `/opt/mvmp` (mode 750)
- Log dir: `/var/log/mvmp` (mode 750)
- PID dir: `/var/run/mvmp`
- Backup dir: `/var/backups/mvmp` (mode 700)
- Grants `mvmp` group read access to `/etc/mvmp/*.env`

### 8.2 Copy the built app to /opt/mvmp

If you built in a different directory:

```bash
sudo rsync -a --delete .next/standalone/ /opt/mvmp/.next/standalone/
sudo rsync -a prisma/ /opt/mvmp/prisma/
sudo rsync -a mini-services/ /opt/mvmp/mini-services/
sudo rsync -a scripts/ /opt/mvmp/scripts/
sudo chown -R mvmp:mvmp /opt/mvmp
```

### 8.3 Install systemd units

```bash
sudo bash scripts/deploy/setup-systemd.sh
```

This installs three unit files from `deploy/systemd/`:
- `mvmp-api.service` — Next.js standalone API (port 3000)
- `mvmp-worker.service` — BullMQ background worker (no port)
- `mvmp-realtime.service` — socket.io gateway (port 3003 + 3004 internal)

`mvmp-agent.service` is intentionally NOT installed because the current MVMP repository has no Go agent. The unit file is preserved in `deploy/systemd/mvmp-agent.service` for future use.

Each unit:
- Runs as user `mvmp` (NOT root)
- Loads environment from `/etc/mvmp/db.env`, `/etc/mvmp/redis.env`, `/etc/mvmp/app.env`
- Has `Restart=on-failure` with 5s backoff
- Sends `SIGTERM` for graceful shutdown (Next.js, BullMQ worker, and realtime service all have SIGTERM handlers)
- Has resource limits (`MemoryMax`, `LimitNOFILE`, `TasksMax`)
- Has systemd hardening (`NoNewPrivileges`, `ProtectSystem`, `ProtectKernelTunables`, `SystemCallFilter=@system-service`, etc.)
- Depends on `postgresql.service` + `redis-server.service` (where relevant)
- Logs to journald — view with `journalctl -u mvmp-api -f`

### 8.4 Start the services

```bash
sudo systemctl start mvmp-realtime
sudo systemctl start mvmp-api
sudo systemctl start mvmp-worker
sudo systemctl enable mvmp-realtime mvmp-api mvmp-worker
```

### 8.5 Verify

```bash
sudo systemctl status mvmp-api mvmp-worker mvmp-realtime --no-pager
sudo journalctl -u mvmp-api --since "5 min ago" --no-pager
curl -fsS http://127.0.0.1:3000/  # should be HTTP 200
curl -fsS http://127.0.0.1:3004/health  # realtime service
```

---

## 9. Nginx reverse proxy

### 9.1 Install the config

```bash
sudo SERVER_NAME=mvmp.example.com bash scripts/deploy/setup-nginx.sh
```

Substitute your real domain. The script:
1. Copies `deploy/nginx/mvmp.conf` to `/etc/nginx/sites-available/mvmp.conf`
2. Substitutes `SERVER_NAME`, `CERT_PATH`, `KEY_PATH`
3. Disables the default site
4. Enables the mvmp site
5. Creates `/var/www/letsencrypt` for ACME challenges
6. Runs `nginx -t` to validate

The Nginx config:
- Listens on 80 (redirect to 443) and 443 (TLS 1.2/1.3)
- Proxies `/` → `127.0.0.1:3000` (Next.js)
- Proxies `/socket.io/` → `127.0.0.1:3003` (realtime, with WebSocket upgrade)
- Rate-limits `/api/chat` (20/min/IP), `/api/auth/login|register` (5/min/IP), generic `/api/` (10/s/IP)
- Sets security headers: HSTS, X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy
- Limits request body to 10 MB
- Logs to `/var/log/nginx/mvmp.{access,error}.log`

Internal ports 3000, 3003, 3004, 5432, 6379 are NEVER exposed publicly — Nginx proxies only to loopback.

### 9.2 Apply the config

```bash
sudo systemctl reload nginx
```

---

## 10. HTTPS (Let's Encrypt)

```bash
sudo certbot --nginx -d mvmp.example.com --redirect
```

Certbot will:
- Issue a certificate via the HTTP-01 challenge (uses `/var/www/letsencrypt`)
- Update the Nginx config to point to the new cert
- Set up auto-renewal via `certbot.timer` systemd unit

Verify auto-renewal:

```bash
sudo certbot renew --dry-run
```

---

## 11. Firewall (UFW)

```bash
sudo bash scripts/deploy/setup-firewall.sh
```

This:
- Resets UFW to defaults
- Denies all incoming, allows all outgoing
- Allows SSH (port 22, rate-limited)
- Allows HTTP (80) and HTTPS (443)
- Does NOT open 3000/3003/3004/5432/6379 — those bind to 127.0.0.1 only

Verify:

```bash
sudo ufw status verbose
```

---

## 12. Backup

### 12.1 Manual backup

```bash
sudo bash scripts/deploy/backup.sh
# With app code artifacts (weekly):
sudo INCLUDE_APP=1 bash scripts/deploy/backup.sh
```

Backup contents (in `/var/backups/mvmp/<timestamp>/`):
- `postgres-<ts>.dump.gz` — pg_dump custom format, gzipped
- `app-config-<ts>.tar.gz` — `/etc/mvmp/*.env` (mode 0600)
- `redis-<ts>.rdb.gz` — Redis RDB snapshot
- `standalone-<ts>.tar.gz` — (optional) `.next/standalone`
- `manifest-<ts>.json` — backup metadata

The script:
- NEVER logs passwords or connection strings
- Prunes backups older than `BACKUP_RETENTION_DAYS` (default 30)
- Each backup is in its own timestamped directory for easy auditing

### 12.2 Automatic nightly backup

Install the cron file:

```bash
sudo cp deploy/cron/mvmp-backup /etc/cron.d/mvmp-backup
sudo chmod 644 /etc/cron.d/mvmp-backup
sudo systemctl reload cron 2>/dev/null || sudo systemctl reload crond
```

This runs a nightly DB+config+Redis backup at 03:00 and a weekly full backup (including app code) on Sunday at 04:00.

---

## 13. Restore

```bash
# Restore from a specific backup directory
sudo bash scripts/deploy/restore.sh /var/backups/mvmp/20260101-030000

# Restore from a specific dump file
sudo bash scripts/deploy/restore.sh /var/backups/mvmp/20260101-030000/postgres-*.dump.gz

# Skip the confirmation prompt (automation)
sudo bash scripts/deploy/restore.sh /var/backups/mvmp/20260101-030000 --force
```

The restore script:
1. Validates the backup path + manifest
2. Takes a **safety backup** of the current state first
3. Stops MVMP services (does NOT stop Postgres/Redis)
4. Drops + recreates the `mvmp` database, then `pg_restore --clean`
5. Optionally restores `/etc/mvmp` (with explicit prompt unless `--force`)
6. Stops Redis, copies the RDB, restarts Redis
7. Starts MVMP services
8. Runs `health-check.sh`

**Confirmation is REQUIRED** unless `--force` is given. The script NEVER silently overwrites.

---

## 14. Update the application

To deploy a new version of MVMP:

```bash
cd /opt/mvmp
git pull origin main

# 1. Backup current state
sudo bash scripts/deploy/backup.sh

# 2. Build new artifacts
bash scripts/deploy/build.sh

# 3. Apply any new migrations (non-destructive — deploy mode)
sudo bash scripts/deploy/migrate.sh

# 4. Restart services
sudo systemctl restart mvmp-realtime mvmp-api mvmp-worker

# 5. Verify
sudo bash scripts/deploy/health-check.sh
```

If anything looks wrong, see §15 for rollback.

---

## 15. Rollback

```bash
# List available backups
ls -t /var/backups/mvmp/

# Roll back to the latest backup
sudo bash scripts/deploy/rollback.sh

# Roll back to a specific backup
sudo bash scripts/deploy/rollback.sh --force
# Then restore from the specific backup:
sudo bash scripts/deploy/restore.sh /var/backups/mvmp/<timestamp> --force
```

The rollback script:
1. Lists applied Prisma migrations
2. Finds the latest backup
3. Takes a safety backup of current state
4. Calls `restore.sh` to revert to the chosen backup

**Note**: Prisma does not auto-generate down-migrations. Rollback is always via DB restore from a backup, not via `prisma migrate down`.

---

## 16. Troubleshooting

### 16.1 Service won't start

```bash
sudo journalctl -u mvmp-api --since "10 min ago" --no-pager -p err
sudo systemctl status mvmp-api --no-pager
```

Common causes:
- Missing `AI_ENCRYPTION_KEY` → set in `/etc/mvmp/app.env` (see §5.2)
- Wrong file permissions on `/etc/mvmp/*.env` → should be `0640`, owner `root:mvmp`
- Postgres not running → `sudo systemctl status postgresql`
- Redis not running → `sudo systemctl status redis-server`

### 16.2 Database connection refused

```bash
sudo -u postgres psql -c "\l"   # list databases
ss -ltn | grep 5432             # should be 127.0.0.1:5432
sudo cat /etc/mvmp/db.env       # verify connection string
```

If Postgres is bound to a different interface, edit `/etc/postgresql/<ver>/main/postgresql.conf` and set `listen_addresses = '127.0.0.1'`.

### 16.3 Redis auth failed

```bash
sudo cat /etc/mvmp/redis.env
redis-cli -a "$(sudo grep MVMP_REDIS_PASSWORD= /etc/mvmp/redis.env | cut -d= -f2)" ping
```

### 16.4 Nginx returns 502

The API server isn't running or is on the wrong port:

```bash
sudo systemctl status mvmp-api
curl -fsS http://127.0.0.1:3000/  # should be 200
sudo nginx -t                    # validate config
sudo tail -50 /var/log/nginx/mvmp.error.log
```

### 16.5 WebSocket (realtime) not working

```bash
sudo systemctl status mvmp-realtime
curl -fsS http://127.0.0.1:3004/health  # should return {"ok":true,...}
```

If the realtime service is up but the browser can't connect, verify Nginx is forwarding `/socket.io/` correctly (see `deploy/nginx/mvmp.conf`).

### 16.6 View logs

```bash
# All MVMP services (last 100 lines)
sudo journalctl -u mvmp-api -u mvmp-worker -u mvmp-realtime -n 100 --no-pager

# Follow live
sudo journalctl -u mvmp-api -f

# Nginx
sudo tail -f /var/log/nginx/mvmp.access.log /var/log/nginx/mvmp.error.log

# PostgreSQL
sudo tail -f /var/log/postgresql/postgresql-*.log

# Redis
sudo tail -f /var/log/redis/redis-server.log
```

### 16.7 Disk full

```bash
df -h /
sudo du -sh /var/backups/mvmp /var/log /var/lib/postgresql /var/lib/redis
sudo journalctl --vacuum-time=7d   # trim journald
```

Reduce `BACKUP_RETENTION_DAYS` in `/etc/mvmp/app.env` if backups are consuming too much space.

---

## Appendix A — File layout after deployment

```
/opt/mvmp/                              # application directory
  .next/standalone/server.js            # Next.js standalone API
  .next/standalone/.next/static/        # frontend assets
  .next/standalone/public/              # public files
  prisma/schema.postgres.prisma         # PostgreSQL schema
  mini-services/realtime-service/       # socket.io gateway
  scripts/deploy/                       # all deploy scripts
  deploy/systemd/                       # unit file templates
  deploy/nginx/                         # nginx config template
  docs/deployment/                      # this documentation

/etc/mvmp/                              # root-only config (mode 0750)
  db.env                                # DATABASE_URL (mode 0600)
  redis.env                             # REDIS_URL (mode 0600)
  app.env                               # other env (mode 0640)

/etc/systemd/system/
  mvmp-api.service                      # installed
  mvmp-worker.service                   # installed
  mvmp-realtime.service                 # installed
  mvmp-agent.service                    # NOT installed (no Go agent)

/etc/nginx/sites-available/mvmp.conf    # installed
/etc/nginx/sites-enabled/mvmp.conf      # symlink to above

/var/log/mvmp/                          # application logs (mode 0750)
/var/backups/mvmp/                      # backups (mode 0700)
/var/lib/postgresql/<ver>/main/         # PostgreSQL data
/var/lib/redis/                         # Redis data + AOF
```

## Appendix B — Port map

| Port | Service | Bound to | Public? |
| --- | --- | --- | --- |
| 22 | SSH | 0.0.0.0 | Yes (rate-limited) |
| 80 | Nginx HTTP | 0.0.0.0 | Yes (redirects to 443) |
| 443 | Nginx HTTPS | 0.0.0.0 | Yes |
| 3000 | mvmp-api | 127.0.0.1 | No (Nginx proxies) |
| 3003 | mvmp-realtime socket.io | 127.0.0.1 | No (Nginx proxies /socket.io/) |
| 3004 | mvmp-realtime internal emit | 127.0.0.1 | No (server-to-server only) |
| 5432 | PostgreSQL | 127.0.0.1 | No |
| 6379 | Redis | 127.0.0.1 | No |

## Appendix C — Useful commands cheat sheet

```bash
# Service control
sudo systemctl {start|stop|restart|status|enable|disable} mvmp-{api,worker,realtime}

# Logs
sudo journalctl -u mvmp-api -f
sudo journalctl -u mvmp-api --since "1 hour ago" -p err

# Health
bash scripts/deploy/health-check.sh

# Backup / restore
sudo bash scripts/deploy/backup.sh
sudo bash scripts/deploy/restore.sh <backup-dir>

# Build / migrate
bash scripts/deploy/build.sh
sudo bash scripts/deploy/migrate.sh

# Database
sudo -u postgres psql
PGPASSWORD=... psql -h 127.0.0.1 -U mvmp -d mvmp

# Redis
redis-cli -a "$(sudo grep MVMP_REDIS_PASSWORD= /etc/mvmp/redis.env | cut -d= -f2)" --no-auth-warning
```
