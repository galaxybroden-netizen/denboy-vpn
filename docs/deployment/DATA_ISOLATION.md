# MVMP — Data Isolation Between Deployment Modes (Phase 14 TASK 6)

This document specifies how Docker and Native deployments keep their data, ports, environment, and services separate when both run on the same host.

**Recommendation**: Run only ONE deployment method per host in production. The table below shows what would happen if both ran simultaneously — useful for staging or migration cutover.

---

## 1. Isolation matrix

| Resource | Docker (Phase 14) | Native (Phase 13) | Conflict? |
| --- | --- | --- | --- |
| **App source code** | `/opt/mvmp` (shared) | `/opt/mvmp` (shared) | No — same repo, both modes read it |
| **PostgreSQL data** | Docker volume `mvmp_mvmp-pgdata` | `/var/lib/postgresql/<ver>/main/` | No — separate storage |
| **Redis data** | Docker volume `mvmp_mvmp-redis-data` | `/var/lib/redis/` | No — separate storage |
| **Backups** | Docker volume `mvmp_mvmp-backups` (host: `/var/lib/docker/volumes/...`) | `/var/backups/mvmp/` | No — different dirs |
| **App config env** | `$REPO_ROOT/.env` (loaded by compose) | `/etc/mvmp/{db.env,redis.env,app.env}` (root-only files) | No — different files |
| **API port (host)** | `127.0.0.1:3001` (published from container's 3000) | `127.0.0.1:3000` | No — different ports |
| **Realtime port (host)** | `127.0.0.1:3005` (published from container's 3003) | `127.0.0.1:3003` | No — different ports |
| **PostgreSQL port** | NOT published (internal to `mvmp-net`) | `127.0.0.1:5432` (loopback) | No — Docker PG not bound to host |
| **Redis port** | NOT published (internal to `mvmp-net`) | `127.0.0.1:6379` (loopback) | No — Docker Redis not bound to host |
| **HTTP/HTTPS (80/443)** | Use host Nginx (recommended) | Use host Nginx | **⚠️ Only ONE front-line Nginx should bind 80/443** |
| **systemd services** | None (containers managed by Docker daemon) | `mvmp-{api,worker,realtime}.service` | No — different process managers |
| **Container names** | `mvmp-api-1`, `mvmp-worker-1`, etc. (compose project `mvmp`) | N/A | No |
| **Linux user** | `mvmp` (uid 1001) INSIDE each container | `mvmp` system user on host | No — different namespaces |
| **Logs** | `docker compose logs <svc>` (json-file driver, rotated) | `/var/log/mvmp/` + journald | No — different log sinks |

---

## 2. Port allocation summary

```
Public (host):
  22    SSH
  80    Nginx HTTP (→ redirect to 443)
  443   Nginx HTTPS (→ proxy to mvmp-api)

Loopback only (host):
  3000  Native mvmp-api
  3001  Docker mvmp-api (published from container's 3000)
  3003  Native mvmp-realtime socket.io
  3005  Docker mvmp-realtime (published from container's 3003)
  5432  Native PostgreSQL (NOT used by Docker PG — internal network)
  6379  Native Redis (NOT used by Docker Redis — internal network)

Docker-internal only (mvmp-net):
  postgres:5432
  redis:6379
  api:3000
  worker (no port)
  realtime:3003, 3004
```

---

## 3. Front-line Nginx strategy

If both deployment modes coexist on the same host, the operator must choose ONE Nginx to bind ports 80/443:

### Option A — Host Nginx fronts both (recommended)

```
                 ┌───────────────────────────────┐
   public 80/443 │  Host Nginx                    │
        ────────►│  /api/chat  → rate limit       │
                 │  /socket.io/ → upstream        │
                 │  /          → upstream         │
                 └───────┬───────────┬───────────┘
                         │           │
                ┌────────▼──┐  ┌─────▼───────┐
                │ Docker    │  │ Native      │
                │ 127.0.0.1 │  │ 127.0.0.1   │
                │ :3001     │  │ :3000       │
                │ :3005     │  │ :3003       │
                └───────────┘  └─────────────┘
```

In this topology, the host Nginx config (`deploy/nginx/mvmp.conf`) chooses ONE upstream to proxy to. Switch the upstream block to point at either `127.0.0.1:3001` (Docker) or `127.0.0.1:3000` (Native) when migrating.

### Option B — Docker Nginx fronts both

Add a `nginx` service to `docker-compose.yml` that publishes `0.0.0.0:80` and `0.0.0.0:443`. **Not recommended** — it requires Docker to own host ports 80/443 and conflicts with the host Nginx from Phase 13. Use Option A.

### Option C — One mode only per host (cleanest)

Each host runs EITHER Docker OR Native. Migration between modes is done via backup → reinstall → restore. See migration guides.

---

## 4. Volume and directory isolation

### Docker volumes (managed by Docker daemon)

```bash
$ docker volume ls | grep mvmp
local    mvmp_mvmp-backups
local    mvmp_mvmp-pgdata
local    mvmp_mvmp-redis-data

$ docker volume inspect mvmp_mvmp-pgdata
[
    {
        "CreatedAt": "...",
        "Driver": "local",
        "Labels": { "com.docker.compose.project": "mvmp" },
        "Mountpoint": "/var/lib/docker/volumes/mvmp_mvmp-pgdata/_data",
        "Name": "mvmp_mvmp-pgdata",
        "Scope": "local"
    }
]
```

### Native directories (managed by apt packages)

| Path | Owner | Mode | Contents |
| --- | --- | --- | --- |
| `/var/lib/postgresql/<ver>/main/` | `postgres:postgres` | `0700` | PostgreSQL data dir |
| `/var/lib/redis/` | `redis:redis` | `0750` | Redis RDB + AOF |
| `/var/backups/mvmp/` | `root:root` | `0700` | Native backup artifacts |
| `/etc/mvmp/` | `root:mvmp` | `0750` | Env files (root-only inside) |
| `/var/log/mvmp/` | `mvmp:mvmp` | `0750` | Native app logs |
| `/opt/mvmp/` | `mvmp:mvmp` | `0750` | App source code |

Docker does NOT touch any of these paths. The volumes live under `/var/lib/docker/volumes/` which is owned by the Docker daemon.

---

## 5. Environment isolation

### Docker

- Single `.env` file in repo root (loaded by docker compose)
- Contains: `MVMP_DB_PASSWORD`, `MVMP_REDIS_PASSWORD`, `AI_ENCRYPTION_KEY`, `SESSION_SECRET`, `PUBLIC_URL`, resource profile vars
- Mode: `0600`, owner: the user running `docker compose up` (typically root or a `docker` group member)
- Never baked into the image (Dockerfile never `COPY .env`)

### Native

- Three env files in `/etc/mvmp/`:
  - `db.env` (mode 0600, owner root) — `DATABASE_URL`, `MVMP_DB_*`
  - `redis.env` (mode 0600, owner root) — `REDIS_URL`, `MVMP_REDIS_*`
  - `app.env` (mode 0640, owner root:mvmp) — everything else
- systemd units load these via `EnvironmentFile=`
- Only readable by root + members of the `mvmp` group

### Conflict?

None. Docker reads from `$REPO_ROOT/.env`; Native reads from `/etc/mvmp/*.env`. Different paths, different files, different ownership.

The env VAR NAMES are identical (e.g., both use `DATABASE_URL`). The VALUES differ because the connection strings point at different hosts:
- Docker: `postgresql://mvmp:<pw>@postgres:5432/mvmp` (service name on `mvmp-net`)
- Native: `postgresql://mvmp:<pw>@127.0.0.1:5432/mvmp` (loopback)

---

## 6. Backup isolation

### Docker

```bash
bash scripts/deploy/docker-backup.sh
# → writes to Docker volume mvmp_mvmp-backups at /backups/<timestamp>/
# → host path: /var/lib/docker/volumes/mvmp_mvmp-backups/_data/<timestamp>/
```

### Native

```bash
sudo bash scripts/deploy/backup.sh
# → writes to /var/backups/mvmp/<timestamp>/
```

The two backup destinations are physically different directories. Backups never mix. Each mode has its own restore script that only reads from its own backup location.

---

## 7. systemd vs Docker — no conflict

- Native: `mvmp-api.service`, `mvmp-worker.service`, `mvmp-realtime.service` managed by systemd. Names reserved.
- Docker: containers named `mvmp-api-1`, `mvmp-worker-1`, etc. (compose project name `mvmp`). No systemd units with these names.
- The Docker daemon is the only systemd unit Docker creates (`docker.service`). It does NOT conflict with the MVMP-native units.

If a host runs both, the `mvmp` Linux user exists (created by `create-user.sh`). Docker containers use the user `mvmp` INSIDE the container (uid 1001) — this is a container-internal user, NOT the host's `mvmp` user. No conflict.

---

## 8. Migration guides

See:
- `docs/deployment/MIGRATION_NATIVE_TO_DOCKER.md` — move from Native to Docker
- `docs/deployment/MIGRATION_DOCKER_TO_NATIVE.md` — move from Docker to Native

Both migrations:
1. Backup the source deployment.
2. Install the target deployment fresh.
3. Restore the backup into the target.
4. Verify health.
5. Switch Nginx upstream to the new deployment.
6. Decommission the old deployment.

**NEVER auto-move data.** Every migration step requires explicit operator confirmation.

---

## 9. Coexistence test checklist

If you intentionally run both modes on the same host (e.g., for blue/green cutover):

```bash
# 1. Confirm Docker PG is NOT bound to host 5432
docker compose -f deploy/docker/docker-compose.yml ps --format json postgres | jq -r '.Publishers // []'
# Expected: empty array (no ports published)

# 2. Confirm Native PG IS bound to loopback 5432
ss -ltn | grep 5432
# Expected: 127.0.0.1:5432  (NOT 0.0.0.0:5432)

# 3. Confirm Docker API on 3001
curl -fsS http://127.0.0.1:3001/ | head -1

# 4. Confirm Native API on 3000
curl -fsS http://127.0.0.1:3000/ | head -1

# 5. Confirm only ONE Nginx on 80/443
ss -ltn | grep -E ':80 |:443 '
# Expected: a single line, either Docker container's published port OR host Nginx

# 6. Confirm backups are separate
ls /var/backups/mvmp/        # Native backups
docker volume inspect mvmp_mvmp-backups  # Docker backups
```
