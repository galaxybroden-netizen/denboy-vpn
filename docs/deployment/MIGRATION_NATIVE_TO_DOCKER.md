# MVMP — Migration: Native → Docker (Phase 14)

This guide walks an operator through migrating an existing MVMP Native deployment (Phase 13) to a Docker deployment (Phase 14), preserving all data.

**Duration**: 30–60 minutes, depending on database size and backup transfer speed.

**Downtime**: 5–15 minutes during the final cutover step.

**Risk**: Low. Every step is reversible until the source deployment is decommissioned.

---

## 0. Pre-migration checklist

- [ ] Source Native deployment is healthy: `bash scripts/deploy/health-check.sh` reports all PASS.
- [ ] Docker Engine 24+ and Docker Compose v2 are installed on the target host.
- [ ] At least 10 GB free disk for the Docker image + volumes + backup transfer.
- [ ] Operator has sudo on the target host.
- [ ] A maintenance window of 30–60 minutes is scheduled.
- [ ] DNS TTL for the public domain is set low (300s) so the cutover takes effect quickly.

If the source and target are different hosts:
- [ ] SSH access between source and target works.
- [ ] Backup file can be transferred (scp, rsync, or shared volume).

If source and target are the same host:
- [ ] Both modes can coexist (see `DATA_ISOLATION.md`) — different ports, different volumes.

---

## 1. Backup the Native deployment

On the source host:

```bash
cd /opt/mvmp
sudo bash scripts/deploy/backup.sh
# Note the backup timestamp printed at the end, e.g. 20260101-030000

sudo ls -la /var/backups/mvmp/20260101-030000/
# Should contain:
#   postgres-20260101-030000.dump.gz
#   app-config-20260101-030000.tar.gz
#   redis-20260101-030000.rdb.gz
#   manifest-20260101-030000.json
```

This backup contains everything needed to restore MVMP on Docker.

---

## 2. Install Docker on the target host (if not present)

```bash
# Ubuntu 22.04 / 24.04
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# log out + back in

docker --version
docker compose version
```

If Docker was already installed, verify version ≥ 24.

---

## 3. Configure the Docker deployment

On the target host:

```bash
cd /opt/mvmp   # or wherever the repo is checked out
cp deploy/docker/docker-compose.env.example .env
chmod 600 .env
nano .env
```

Set the required secrets:
- `MVMP_DB_PASSWORD` — **use the same password** as the Native deployment (read it from `/etc/mvmp/db.env` on the source host).
- `MVMP_REDIS_PASSWORD` — **use the same password** as Native (from `/etc/mvmp/redis.env`).
- `AI_ENCRYPTION_KEY` — **MUST be the same** as Native. Without the same key, encrypted AI provider API keys in the database cannot be decrypted. Read it from `/etc/mvmp/app.env` on the source host.
- `SESSION_SECRET` — **use the same value** as Native (so existing sessions remain valid).
- `PUBLIC_URL` — same domain.

```bash
# Read secrets from Native (run on source host, copy values to target's .env)
sudo cat /etc/mvmp/db.env        # MVMP_DB_PASSWORD
sudo cat /etc/mvmp/redis.env     # MVMP_REDIS_PASSWORD
sudo cat /etc/mvmp/app.env       # AI_ENCRYPTION_KEY, SESSION_SECRET, PUBLIC_URL
```

---

## 4. Build the Docker image

```bash
docker compose -f deploy/docker/docker-compose.yml build api
```

Expected: 3–5 minutes. Image size ~600 MB.

---

## 5. Start PostgreSQL and Redis containers

```bash
docker compose -f deploy/docker/docker-compose.yml up -d postgres redis
# Wait for healthy
docker compose -f deploy/docker/docker-compose.yml ps postgres redis
# Both should show "running (healthy)"
```

---

## 6. Transfer the backup to the Docker volume

### Same host

```bash
# Find the backup volume mount point
HOST_PATH=$(docker volume inspect mvmp_mvmp-backups --format '{{ .Mountpoint }}')
sudo mkdir -p "$HOST_PATH/native-import"
sudo cp /var/backups/mvmp/<timestamp>/postgres-*.dump.gz "$HOST_PATH/native-import/"
sudo chown -R 999:999 "$HOST_PATH/native-import"   # postgres container uid
```

### Different host

```bash
# On source
scp /var/backups/mvmp/<timestamp>/postgres-*.dump.gz target-host:/tmp/

# On target
HOST_PATH=$(docker volume inspect mvmp_mvmp-backups --format '{{ .Mountpoint }}')
sudo mkdir -p "$HOST_PATH/native-import"
sudo cp /tmp/postgres-*.dump.gz "$HOST_PATH/native-import/"
sudo chown -R 999:999 "$HOST_PATH/native-import"
```

---

## 7. Restore the PostgreSQL backup into the Docker container

```bash
# Run inside a temporary postgres container that has access to the volume + network
docker run --rm \
  -v mvmp_mvmp-backups:/backups:ro \
  --network mvmp_mvmp-net \
  -e PGPASSWORD="$MVMP_DB_PASSWORD" \
  postgres:16-alpine sh -c "
    gunzip -c /backups/native-import/postgres-*.dump.gz | \
    pg_restore -h postgres -U $MVMP_DB_USER -d $MVMP_DB_NAME \
      --no-owner --no-privileges --clean --if-exists
"

# Verify row counts
docker compose -f deploy/docker/docker-compose.yml exec -T postgres \
  psql -U "$MVMP_DB_USER" -d "$MVMP_DB_NAME" -c "
    SELECT 'users' AS table, count(*) FROM \"User\"
    UNION ALL SELECT 'servers', count(*) FROM \"Server\"
    UNION ALL SELECT 'vpn_accounts', count(*) FROM \"VpnAccount\"
    UNION ALL SELECT 'conversations', count(*) FROM \"ChatConversation\";
  "
```

The row counts should match the source Native deployment.

---

## 8. (Optional) Restore Redis from RDB

Redis state is less critical (rate-limit counters, BullMQ jobs) and can usually be rebuilt from scratch. If you want to preserve it:

```bash
# Stop Docker Redis
docker compose -f deploy/docker/docker-compose.yml stop redis

# Find Redis data volume mount
REDIS_VOL=$(docker volume inspect mvmp_mvmp-redis-data --format '{{ .Mountpoint }}')

# Copy the Native RDB
sudo cp /var/backups/mvmp/<timestamp>/redis-*.rdb.gz /tmp/
gunzip /tmp/redis-*.rdb.gz
sudo cp /tmp/redis-*.rdb "$REDIS_VOL/dump.rdb"
sudo chown 999:999 "$REDIS_VOL/dump.rdb"

# Restart Redis (will load the RDB)
docker compose -f deploy/docker/docker-compose.yml start redis
```

---

## 9. Start MVMP API, Worker, Realtime containers

```bash
docker compose -f deploy/docker/docker-compose.yml up -d
docker compose -f deploy/docker/docker-compose.yml ps
# All 5 services should be running (healthy)
```

Run migrations (in case the Docker image has a newer schema than the backup):

```bash
docker compose -f deploy/docker/docker-compose.yml exec -T api \
  bunx prisma migrate deploy --schema prisma/schema.postgres.prisma
```

---

## 10. Verify the Docker deployment

```bash
bash scripts/deploy/docker-health-check.sh
```

All checks should PASS.

Smoke test:
- Visit `https://mvmp.your-domain.com/` — landing page loads.
- Log in as superadmin → dashboard loads.
- Customer portal → VPN accounts visible.
- Send a chat message → AI replies (or mock fallback if no provider configured).
- Admin → Live Chat → conversation appears.

---

## 11. Switch Nginx upstream to Docker

Edit the host Nginx config:

```bash
sudo nano /etc/nginx/sites-available/mvmp.conf
```

Change the upstreams to point at Docker's published ports:

```nginx
upstream mvmp_api {
    server 127.0.0.1:3001;     # was 127.0.0.1:3000 (Native)
    keepalive 32;
}
upstream mvmp_realtime {
    server 127.0.0.1:3005;     # was 127.0.0.1:3003 (Native)
    keepalive 16;
}
```

Validate + reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Public traffic now flows to the Docker deployment.

---

## 12. Stop the Native services

```bash
sudo systemctl stop mvmp-api mvmp-worker mvmp-realtime
sudo systemctl disable mvmp-api mvmp-worker mvmp-realtime
```

Native PostgreSQL and Redis are still running but unused. Decide whether to keep them as a fallback or shut them down:

```bash
# Fallback mode (keep Native PG + Redis running for 7 days)
sudo systemctl stop mvmp-api mvmp-worker mvmp-realtime   # only the app services

# Full decommission (after confidence period)
sudo systemctl stop postgresql redis-server
sudo systemctl disable postgresql redis-server
```

---

## 13. Update cron backups

Remove the Native backup cron and install the Docker one:

```bash
sudo rm /etc/cron.d/mvmp-backup
sudo cp deploy/docker/backup-cron /etc/cron.d/mvmp-docker-backup
sudo chmod 644 /etc/cron.d/mvmp-docker-backup
sudo systemctl reload cron
```

---

## 14. Rollback (if anything goes wrong)

If the Docker deployment has issues within the first 24 hours:

```bash
# Stop Docker
docker compose -f deploy/docker/docker-compose.yml down

# Re-enable Native services
sudo systemctl enable mvmp-api mvmp-worker mvmp-realtime
sudo systemctl start mvmp-realtime mvmp-api mvmp-worker

# Revert Nginx upstream
sudo nano /etc/nginx/sites-available/mvmp.conf
# Change back to 127.0.0.1:3000 and 127.0.0.1:3003
sudo nginx -t && sudo systemctl reload nginx
```

Public traffic returns to the Native deployment. No data loss — the Native database was never touched.

---

## 15. Post-migration tasks

- [ ] Monitor Docker logs for 24 hours: `docker compose logs -f api worker realtime`
- [ ] Verify AI provider keys still decrypt (chatbot responds to test prompts)
- [ ] Verify VPN accounts still provision correctly
- [ ] Run `docker-health-check.sh` daily for the first week
- [ ] After 7 days of stable operation, decommission Native (step 12, full decommission)
- [ ] Update internal documentation to reflect the new deployment mode

---

## Appendix — Estimated downtime

| Step | Downtime |
| --- | --- |
| 1. Backup Native | 0 (Native still serving) |
| 2. Install Docker | 0 |
| 3. Configure env | 0 |
| 4. Build image | 0 |
| 5. Start PG + Redis containers | 0 |
| 6. Transfer backup | 0 |
| 7. Restore PG into Docker | 0 (Native still serving) |
| 8. Restore Redis | 0 |
| 9. Start Docker API/Worker/Realtime | 0 (running on different port) |
| 10. Verify Docker | 0 |
| **11. Switch Nginx upstream** | **5–15 seconds** (during `systemctl reload nginx`) |
| 12. Stop Native | 0 (already switched) |
| 13. Update cron | 0 |

**Total downtime**: ~5–15 seconds during the Nginx reload. Most users won't notice.
