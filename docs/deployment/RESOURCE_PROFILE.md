# MVMP — Resource Profile (Phase 14 TASK 7)

This document specifies the CPU, RAM, and disk requirements for each MVMP deployment mode, with a focus on the target small-server profile: **4 CPU / 4 GB RAM / Ubuntu 24.04**.

---

## 1. Small profile (default)

Target host:

| Resource | Value |
| --- | --- |
| OS | Ubuntu 24.04 LTS |
| CPU | 4 cores |
| RAM | 4 GB |
| Disk | 20 GB free (10 GB minimum) |
| Architecture | x86_64 |
| Workload | MVMP API + Worker + Realtime + PostgreSQL + Redis + Nginx |

This profile is the DEFAULT in `deploy/docker/shared-production.env.example` (`MVMP_PROFILE=small`).

---

## 2. Resource allocation — Docker mode

| Service | Memory limit (`deploy.resources.limits.memory`) | CPU share | Notes |
| --- | --- | --- | --- |
| `postgres` | 1 GB | shared | PostgreSQL 16 with default shared_buffers |
| `redis` | 256 MB | shared | maxmemory=256mb, noeviction |
| `api` | 1 GB | shared | Next.js 16 standalone, in-memory JIT cache |
| `worker` | 512 MB | shared | BullMQ worker (currently stub — will grow with Phase 12.2 outbox) |
| `realtime` | 256 MB | shared | socket.io gateway |
| `backup` (one-shot) | 256 MB | shared | Only runs during backup |
| Host overhead | ~256 MB | — | Docker daemon + Nginx + OS |

**Total peak RAM**: ~3.3 GB during backup; ~3.0 GB steady state. Fits comfortably in 4 GB.

> **Note**: Docker memory limits are HARD limits. The container's OOM-killer will terminate the process if exceeded. Set these slightly above the application's observed peak to avoid spurious kills.

---

## 3. Resource allocation — Native mode

| Service | Memory | Source |
| --- | --- | --- |
| PostgreSQL | ~1 GB | systemd `mvmp-api.service` does NOT manage PG; PG is configured via `/etc/postgresql/<ver>/main/postgresql.conf` |
| Redis | ~256 MB | `maxmemory 256mb` in `/etc/redis/redis.conf` |
| `mvmp-api.service` | MemoryMax=1.5 GB | systemd unit (deploy/systemd/mvmp-api.service) |
| `mvmp-worker.service` | MemoryMax=768 MB | systemd unit |
| `mvmp-realtime.service` | MemoryMax=384 MB | systemd unit |
| Nginx | ~50 MB | OS package |
| Host overhead | ~300 MB | OS + journald |

**Total peak RAM**: ~4.0 GB. Fits in 4 GB but is tight. Operators seeing OOM should either:
- Reduce `MVMP_API_MEMORY` from 1.5G to 1G (matches Docker profile)
- Reduce PostgreSQL `shared_buffers` from 128MB to 64MB
- Upgrade to 8 GB RAM

---

## 4. CPU allocation

Both modes use shared CPU scheduling (no hard CPU pinning). On a 4-core host:

| Component | Typical CPU usage |
| --- | --- |
| PostgreSQL | 0.1–0.5 cores steady, up to 1 core during complex queries |
| Redis | <0.1 cores |
| Next.js API | 0.1–0.5 cores per concurrent request (compiles routes on first hit) |
| Worker | <0.1 cores (idle most of the time) |
| Realtime | <0.1 cores |
| Nginx | <0.05 cores |
| Build (one-shot) | up to 2 cores during `next build` |

**Total steady-state**: ~1–2 cores. 4 cores is comfortable.

---

## 5. Disk requirements

| Component | Docker | Native |
| --- | --- | --- |
| MVMP source code | /opt/mvmp (~500 MB with node_modules) | same |
| PostgreSQL data | Docker volume `mvmp-pgdata` (starts ~50 MB, grows with usage) | /var/lib/postgresql/ (same growth) |
| Redis data | Docker volume `mvmp-redis-data` (~10 MB AOF+RDB) | /var/lib/redis/ (same) |
| Backups | Docker volume `mvmp-backups` (~50 MB per backup, 30-day retention = ~1.5 GB) | /var/backups/mvmp/ (same) |
| Docker images | ~600 MB (oven/bun:1.3-debian base + ~400 MB app) | N/A |
| Nginx logs | /var/log/nginx/ (~10 MB/week rotated) | same |
| MVMP logs | Docker json-file driver, 10 MB × 10 files per service = ~100 MB | /var/log/mvmp/ + journald |
| Build artifacts | .next/standalone (~150 MB) | same |
| OS overhead | ~2 GB | ~2 GB |

**Total**: ~5 GB initial, ~10 GB after 30 days of backups. 20 GB free is comfortable.

---

## 6. AI provider — explicit Ollama opt-out

The default configuration does **NOT** enable Ollama or any local LLM. AI calls go to external providers (OpenAI, Anthropic, Gemini) configured via the AI Center UI.

Reasons:
- Ollama requires 4–8 GB RAM per model loaded into VRAM/RAM — exceeds the 4 GB target profile.
- Local LLMs are slow on CPU-only hosts (typical response time 30+ seconds per query).
- External providers offer free tiers sufficient for MVMP's chat volume.

To enable Ollama (NOT recommended on 4 GB hosts):

```bash
# Native
sudo apt-get install ollama
sudo systemctl enable --now ollama
ollama pull llama3.2:1b  # smallest model, ~1.3 GB

# Configure in AI Center UI:
#   Provider: Ollama
#   Base URL: http://127.0.0.1:11434
#   Model: llama3.2:1b
```

Enabling Ollama on a 4 GB host will likely cause OOM kills. The operator MUST upgrade RAM first.

---

## 7. Tuning knobs

All memory limits are configurable via environment variables in both modes:

| Variable | Default | Docker compose uses | Native systemd uses |
| --- | --- | --- | --- |
| `MVMP_API_MEMORY` | 1G | ✅ (docker compose `deploy.resources.limits.memory`) | systemd `MemoryMax` reads from env (but Phase 13 hardcodes 1.5G — see note) |
| `MVMP_WORKER_MEMORY` | 512M | ✅ | hardcoded 768M |
| `MVMP_REALTIME_MEMORY` | 256M | ✅ | hardcoded 384M |
| `MVMP_POSTGRES_MEMORY` | 1G | ✅ | not enforced by systemd (PG tuned via postgresql.conf) |
| `MVMP_REDIS_MEMORY` | 256M | ✅ | enforced via `maxmemory 256mb` in redis.conf |

**Note on Native**: Phase 13 systemd units hardcode `MemoryMax` values. To change them, edit `deploy/systemd/*.service` directly and re-run `setup-systemd.sh`. Phase 14 does NOT modify the Phase 13 units (additive-only rule).

To apply Docker memory changes after editing `.env`:

```bash
docker compose -f deploy/docker/docker-compose.yml up -d --force-recreate
```

---

## 8. Resource profile comparison table

| Profile | Host specs | Docker total | Native total | Recommended for |
| --- | --- | --- | --- | --- |
| `small` (default) | 4 CPU / 4 GB RAM / 20 GB disk | ~3.3 GB peak | ~4.0 GB peak | Single-host small fleets (<1000 VPN accounts) |
| `medium` | 8 CPU / 8 GB RAM / 50 GB disk | ~5 GB peak | ~6 GB peak | Mid-size fleets with frequent AI usage |
| `large` | 16 CPU / 16 GB RAM / 100 GB disk | ~8 GB peak | ~10 GB peak | Large fleets, multi-tenant, high chat volume |

To switch profile, set `MVMP_PROFILE=medium` (or `large`) in `.env` and adjust the per-service memory vars accordingly.

---

## 9. Pre-deployment resource check

Run `bash scripts/deploy/check-requirements.sh` on the target host:

```
=== MVMP Phase 13 — Server Requirements Check ===
## Operating system
  - Detected: Ubuntu 24.04 LTS
  [PASS] Ubuntu 24.04 LTS — supported
## Architecture
  [PASS] x86_64 — primary target
## CPU
  - CPU cores: 4 (min: 2)
  [PASS] CPU sufficient
## Memory
  - Total RAM: 4 GB (min: 4 GB)
  [PASS] RAM sufficient
## Disk (root filesystem)
  - Available: 20 GB (min: 10 GB)
  [PASS] Disk sufficient
```

All four checks must PASS before proceeding with installation.

---

## 10. Monitoring resource usage

### Docker

```bash
# Per-container stats (live)
docker stats

# Per-container stats (one-shot)
docker compose -f deploy/docker/docker-compose.yml stats --no-stream

# Disk usage of volumes
docker system df -v
```

### Native

```bash
# systemd per-service memory
systemctl status mvmp-api mvmp-worker mvmp-realtime --no-pager | grep -E "Memory:"

# Overall memory
free -h

# Disk usage
df -h /
du -sh /var/lib/postgresql /var/lib/redis /var/backups/mvmp /var/log/mvmp
```

### Health check (both modes)

```bash
# Docker
bash scripts/deploy/docker-health-check.sh

# Native
bash scripts/deploy/health-check.sh
```

Both report disk usage and memory in addition to service status.

---

## 11. Known resource risks

| Risk | Mitigation |
| --- | --- |
| `next build` consumes ~1.5 GB RAM during build on 4 GB hosts | Run build on a separate CI runner, or use pre-built Docker image (`docker pull` instead of `docker build`) |
| PostgreSQL `pg_dump` during backup can spike RAM by ~500 MB | Docker backup container has 256 MB limit — may OOM on very large DBs. Increase `MVMP_POSTGRES_MEMORY` for backup runs, or run backup on a replica |
| Redis `BGSAVE` forks the process — brief 2× memory spike | 256 MB maxmemory → ~512 MB peak during BGSAVE. Fits in 4 GB host |
| AI provider (Ollama) loading models into RAM | Explicit opt-out by default. Operator must enable manually |
| Many concurrent chat requests can exhaust API memory (1 GB) | Rate limit `/api/chat` to 20 req/min per IP (default). Increase `MVMP_API_MEMORY` if legitimate traffic is higher |
| 30-day backup retention fills disk on small hosts | Reduce `BACKUP_RETENTION_DAYS` in env. Run `du -sh /var/backups/mvmp*` periodically |
