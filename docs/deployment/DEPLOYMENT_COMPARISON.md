# MVMP — Deployment Comparison: Docker vs Native (Phase 14)

MVMP supports two production deployment modes. Both use the **same source code**, the **same Prisma schemas**, the **same env vars**, and produce the **same application behavior**. The difference is how the application is packaged and run.

| Aspect | Docker (Phase 14) | Native (Phase 13) |
| --- | --- | --- |
| **Source code** | Same repo (`/opt/mvmp`) | Same repo (`/opt/mvmp`) |
| **Prisma schema (production)** | `prisma/schema.postgres.prisma` | `prisma/schema.postgres.prisma` |
| **Prisma schema (development)** | `prisma/schema.prisma` (SQLite) | `prisma/schema.prisma` (SQLite) |
| **Database** | PostgreSQL 16 (container) | PostgreSQL 15/16 (apt) |
| **Cache/Queue** | Redis 7 (container) | Redis 7 (apt) |
| **API process** | Container `mvmp-api-1` (Next.js standalone via bun) | systemd `mvmp-api.service` (Next.js standalone via node) |
| **Worker process** | Container `mvmp-worker-1` (bun) | systemd `mvmp-worker.service` (bun) |
| **Realtime process** | Container `mvmp-realtime-1` (bun) | systemd `mvmp-realtime.service` (bun) |
| **Reverse proxy** | Host Nginx (recommended) | Host Nginx |
| **Process manager** | Docker daemon | systemd |
| **Resource limits** | docker compose `deploy.resources.limits` | systemd `MemoryMax`/`LimitNOFILE` |
| **Logs** | `docker compose logs` (json-file driver) | journald + `/var/log/mvmp/` |
| **Secrets delivery** | `.env` file (compose loads) | `/etc/mvmp/{db.env,redis.env,app.env}` |
| **Backups** | Docker volume `mvmp_mvmp-backups` | `/var/backups/mvmp/` |
| **Internal ports (host)** | API: `127.0.0.1:3001`, Realtime: `127.0.0.1:3005` | API: `127.0.0.1:3000`, Realtime: `127.0.0.1:3003` |
| **Public ports** | 22, 80, 443 | 22, 80, 443 |
| **Image size** | ~600 MB | N/A (binaries on host) |
| **Install time (fresh)** | ~5 min (build) | ~10 min (apt install + scripts) |
| **Upgrade time** | ~3 min (rebuild + restart) | ~5 min (git pull + build + restart) |
| **Rollback** | `docker-restore.sh <ts>` | `restore.sh <dir>` |
| **Target host** | Any Linux with Docker 24+ | Ubuntu 22.04/24.04 |
| **Resource overhead** | Higher (Docker daemon ~100 MB) | Lower (no daemon) |
| **Best for** | Reproducible deployments, CI/CD, multi-host | Single-host, low-overhead, systemd-integrated hosts |

---

## 1. When to choose Docker

Choose Docker when:

1. **Reproducibility matters**: you want the same image running on staging and production, or across multiple hosts.
2. **CI/CD pipeline**: your build system already produces Docker images.
3. **Multi-host**: you plan to scale horizontally with container orchestration (Swarm, Nomad, Kubernetes).
4. **Isolation**: you want strong filesystem/process isolation between MVMP and other applications on the same host.
5. **Easy upgrades**: `docker compose pull && docker compose up -d` is faster than `git pull && build.sh && systemctl restart`.
6. **Easy rollback**: `docker compose down && docker-restore.sh <ts>` reverts to any previous state.
7. **Dev/prod parity**: developers already use Docker locally.

---

## 2. When to choose Native

Choose Native when:

1. **Low-resource host**: 4 GB RAM or less, where Docker daemon overhead is significant.
2. **systemd integration**: you want MVMP services to participate in systemd's dependency graph (e.g., `Requires=postgresql.service`).
3. **No Docker allowed**: organizational policy or security hardening forbids container runtimes.
4. **Direct OS-level observability**: `journalctl`, `systemctl status`, `perf`, `strace` work without container boundaries.
5. **Single-host deployment**: you don't need to scale horizontally.
6. **Ubuntu LTS preference**: you want PostgreSQL + Redis from the official apt repos, pinned to LTS versions.
7. **Simpler networking**: no Docker bridge network, no port publishing — everything on loopback.

---

## 3. Feature parity

Both modes provide the **exact same MVMP features**:

| Feature | Docker | Native |
| --- | --- | --- |
| Admin panel | ✅ | ✅ |
| Customer portal | ✅ | ✅ |
| Reseller portal | ✅ | ✅ |
| Landing page | ✅ | ✅ |
| Multi-protocol VPN provisioning (Hemat/Pro/Sultan/ALL ACCESS × 1Bulan/1Tahun) | ✅ | ✅ |
| WhatsApp Live Chat + Broadcast + Templates + Integration | ✅ | ✅ |
| AI Center (10 providers, 26 models, RAG over KB) | ✅ | ✅ |
| RBAC (4 roles, 24 permissions) | ✅ | ✅ |
| Payment providers (Xendit, Midtrans, DOKU, iPaymu) | ✅ | ✅ |
| Realtime socket.io (chat widget, dashboards) | ✅ | ✅ |
| Audit log | ✅ | ✅ |
| Backup + restore + rollback | ✅ | ✅ |
| Health check | ✅ (`docker-health-check.sh`) | ✅ (`health-check.sh`) |
| Graceful shutdown (SIGTERM) | ✅ (via `tini` PID 1) | ✅ (via systemd `KillSignal`) |
| Non-root execution | ✅ (uid 1001 inside container) | ✅ (`User=mvmp` in unit) |
| PostgreSQL with scram-sha-256 | ✅ | ✅ |
| Redis with `noeviction` policy | ✅ | ✅ |
| Rate-limited Nginx front | ✅ | ✅ |
| Let's Encrypt HTTPS | ✅ | ✅ |

There is **no feature available in one mode but not the other**.

---

## 4. Operational differences

| Operation | Docker | Native |
| --- | --- | --- |
| Start | `docker compose up -d` | `sudo systemctl start mvmp-api mvmp-worker mvmp-realtime` |
| Stop | `docker compose stop` | `sudo systemctl stop mvmp-api mvmp-worker mvmp-realtime` |
| Restart | `docker compose restart` | `sudo systemctl restart mvmp-api mvmp-worker mvmp-realtime` |
| Status | `docker compose ps` | `systemctl status mvmp-api mvmp-worker mvmp-realtime` |
| Logs (follow) | `docker compose logs -f api` | `journalctl -u mvmp-api -f` |
| Logs (last 100) | `docker compose logs --tail 100 api` | `journalctl -u mvmp-api -n 100 --no-pager` |
| Shell in service | `docker compose exec api sh` | `sudo -u mvmp bash` (on host) |
| Backup | `bash scripts/deploy/docker-backup.sh` | `sudo bash scripts/deploy/backup.sh` |
| Restore | `bash scripts/deploy/docker-restore.sh <ts>` | `sudo bash scripts/deploy/restore.sh <dir>` |
| Health check | `bash scripts/deploy/docker-health-check.sh` | `bash scripts/deploy/health-check.sh` |
| Update | `git pull && docker compose build api && docker compose up -d --force-recreate api worker realtime` | `git pull && bash scripts/deploy/build.sh && sudo systemctl restart mvmp-api mvmp-worker mvmp-realtime` |
| Rollback | `docker-restore.sh <ts>` | `restore.sh <dir>` |
| View config | `docker compose config` | `systemctl cat mvmp-api` |
| Resource usage | `docker stats` | `systemctl status mvmp-api --no-pager` (shows Memory:) |

---

## 5. Security comparison

Both modes enforce the same security posture:

| Control | Docker | Native |
| --- | --- | --- |
| Non-root execution | uid 1001 in container | `User=mvmp` in systemd unit |
| PostgreSQL not exposed publicly | NOT published (internal `mvmp-net`) | `listen_addresses = '127.0.0.1'` |
| Redis not exposed publicly | NOT published (internal `mvmp-net`) | `bind 127.0.0.1 ::1` |
| PostgreSQL auth | `scram-sha-256` | `scram-sha-256` |
| Redis auth | `requirepass` via env | `requirepass` in redis.conf |
| AI_ENCRYPTION_KEY required in prod | Yes (instrumentation hook exits 1 if missing) | Yes (same hook) |
| Internal ports bound to loopback | `127.0.0.1:3001`, `127.0.0.1:3005` | `127.0.0.1:3000`, `127.0.0.1:3003` |
| Nginx TLS 1.2/1.3 + HTTP/2 | ✅ | ✅ |
| Nginx security headers (HSTS, CSP, X-Frame-Options, etc.) | ✅ | ✅ |
| Nginx rate limits (chat 20/min, login 5/min, general 10/s) | ✅ | ✅ |
| UFW firewall (22/80/443 only) | ✅ | ✅ |
| Redis `noeviction` policy (BullMQ jobs protected) | ✅ | ✅ |
| Redis `rename-command FLUSHALL FLUSHDB CONFIG` | ✅ | ❌ (Native Phase 13 does not rename commands — see note) |
| systemd hardening (`NoNewPrivileges`, `ProtectSystem`, `SystemCallFilter`) | N/A (containers handle isolation) | ✅ |
| Container hardening (read-only rootfs possible) | Possible via `read_only: true` (not enabled by default) | N/A |
| Backup files mode 0600 | ✅ | ✅ |
| Secrets never baked into image | ✅ (Dockerfile never `COPY .env`) | N/A (no image) |

**Note**: Native Phase 13 `redis.conf` does NOT use `rename-command` to disable FLUSHALL/FLUSHDB/CONFIG. Docker Phase 14 does. This is a minor hardening difference — operators who want the same hardening on Native can add the `rename-command` lines to `/etc/redis/redis.conf` and restart Redis.

---

## 6. Cost comparison (4 CPU / 4 GB RAM host)

| Resource | Docker | Native |
| --- | --- | --- |
| RAM (steady state) | ~3.0 GB | ~3.5 GB (tight on 4 GB host) |
| RAM (during backup) | ~3.3 GB | ~4.0 GB (very tight) |
| Disk (initial) | ~600 MB image + 500 MB app + 50 MB PG data = ~1.2 GB | ~500 MB app + 50 MB PG data = ~550 MB |
| Disk (30 days) | ~3 GB (with backups) | ~2.5 GB (with backups) |
| CPU overhead | Docker daemon ~0.05 cores | None |

Both modes fit on a 4 CPU / 4 GB host. Native is slightly tighter on RAM during backup; Docker has slightly more disk overhead due to the image.

---

## 7. Can they coexist?

Yes, on the same host. See `DATA_ISOLATION.md` for the full isolation matrix. Summary:

- Different ports: Docker API on 3001, Native API on 3000; Docker Realtime on 3005, Native on 3003.
- Different storage: Docker volumes vs `/var/lib/postgresql/` + `/var/lib/redis/`.
- Different env: `$REPO/.env` (Docker) vs `/etc/mvmp/*.env` (Native).
- Different process managers: Docker daemon vs systemd.

**Caveat**: Only ONE front-line Nginx should bind ports 80/443. The operator chooses which upstream to proxy to.

---

## 8. Recommendation matrix

| Scenario | Recommended mode |
| --- | --- |
| Single-host, 4 GB RAM, Ubuntu 24.04, low traffic | **Native** (lower overhead) |
| Single-host, 8+ GB RAM, any Linux, frequent updates | **Docker** (easier upgrades) |
| Multi-host, blue/green deploys | **Docker** (image-based) |
| Host with strict "no containers" policy | **Native** |
| CI/CD pipeline producing images | **Docker** |
| Organization standardized on systemd + journald | **Native** |
| Operator unfamiliar with Docker | **Native** |
| Operator wants reproducible dev/prod parity | **Docker** |
| 4 GB RAM host with bursty AI traffic | **Native** (no daemon overhead) |
| Need to scale workers independently | **Docker** (`docker compose up -d --scale worker=3`) |

---

## 9. How to switch

If you start with one mode and want to switch to the other, follow the migration guides:

- Native → Docker: `docs/deployment/MIGRATION_NATIVE_TO_DOCKER.md`
- Docker → Native: `docs/deployment/MIGRATION_DOCKER_TO_NATIVE.md`

Both migrations:
1. Backup the source deployment
2. Install the target deployment fresh
3. Restore the backup
4. Switch Nginx upstream
5. Decommission the source

Data is NEVER auto-moved. Every step requires explicit operator confirmation.
