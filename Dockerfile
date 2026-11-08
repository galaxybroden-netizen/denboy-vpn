# syntax=docker/dockerfile:1.7
# MVMP — Multi-stage Dockerfile (Phase 14)
#
# Produces a single image containing:
#   - Next.js standalone API server (.next/standalone/server.js)
#   - BullMQ worker entry (src/worker/index.ts)
#   - Realtime socket.io gateway (mini-services/realtime-service/index.ts)
#   - Generated Prisma client (PostgreSQL)
#
# The same image is used by all three app containers in docker-compose.yml.
# Each container selects its entry point via `command:` in compose.
#
# Stages:
#   1. deps    — install node_modules (cached layer)
#   2. build   — prisma generate + next build
#   3. runtime — minimal image with only production artifacts
#
# Non-root: runs as user `mvmp` (uid 1001) inside the container.
# Base: oven/bun:1.3-debian (slim, glibc, supports sharp native bindings).

# ============================================================
# Stage 1: deps — install all dependencies (including devDeps for build)
# ============================================================
FROM oven/bun:1.3-debian AS deps

WORKDIR /app

# Copy lockfile + package.json first for cache
COPY package.json bun.lock ./

# Install ALL dependencies (including devDeps needed for build)
# --frozen-lockfile ensures reproducible installs
RUN bun install --frozen-lockfile

# ============================================================
# Stage 2: build — generate Prisma client + build Next.js
# ============================================================
FROM oven/bun:1.3-debian AS build

WORKDIR /app

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source
COPY . .

# Use the PostgreSQL Prisma schema (production)
ENV PRISMA_SCHEMA_PATH=prisma/schema.postgres.prisma

# Generate Prisma client for PostgreSQL
RUN bunx prisma generate --schema prisma/schema.postgres.prisma

# Build Next.js (standalone output)
RUN bun run build

# Validate build artifacts exist
RUN test -f .next/standalone/server.js || (echo "BUILD FAILED: server.js missing" && exit 1)
RUN test -d .next/standalone/.next/static || (echo "BUILD FAILED: static dir missing" && exit 1)

# Install only production deps in a separate location for the runtime stage
RUN bun install --production --frozen-lockfile

# ============================================================
# Stage 3: runtime — minimal image with production artifacts
# ============================================================
FROM oven/bun:1.3-debian AS runtime

# Metadata
LABEL org.opencontainers.image.title="MVMP"
LABEL org.opencontainers.image.description="Multi VPN Management Panel — API + Worker + Realtime"
LABEL org.opencontainers.image.source="https://github.com/your-org/mvmp"
LABEL org.opencontainers.image.licenses="proprietary"

# Install runtime system deps:
#   - openssl (Prisma engine needs it)
#   - ca-certificates (TLS for outbound AI provider calls)
#   - tini (PID 1 init, forwards signals for graceful shutdown)
#   - curl (health checks)
# Run as root to install, then drop privileges
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates tini curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user 'mvmp' (uid 1001, gid 1001)
RUN groupadd --system --gid 1001 mvmp \
 && useradd --system --uid 1001 --gid mvmp \
      --home-dir /app --shell /usr/sbin/nologin mvmp

WORKDIR /app

# Copy standalone Next.js build (includes server.js + minimal node_modules)
COPY --from=build --chown=mvmp:mvmp /app/.next/standalone ./
COPY --from=build --chown=mvmp:mvmp /app/.next/static ./.next/static
COPY --from=build --chown=mvmp:mvmp /app/public ./public

# Copy generated Prisma client
COPY --from=build --chown=mvmp:mvmp /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=mvmp:mvmp /app/node_modules/@prisma ./node_modules/@prisma

# Copy worker + realtime source (TypeScript executed via bun at runtime)
COPY --from=build --chown=mvmp:mvmp /app/src/worker ./src/worker
COPY --from=build --chown=mvmp:mvmp /app/src/lib ./src/lib
COPY --from=build --chown=mvmp:mvmp /app/mini-services ./mini-services

# Copy Prisma schema (needed at runtime by Prisma client)
COPY --from=build --chown=mvmp:mvmp /app/prisma/schema.postgres.prisma ./prisma/schema.postgres.prisma

# Copy tsconfig (needed for bun to resolve path aliases like @/lib/*)
COPY --from=build --chown=mvmp:mvmp /app/tsconfig.json ./tsconfig.json

# Copy production deps (already pruned)
COPY --from=build --chown=mvmp:mvmp /app/node_modules ./node_modules

# Copy package.json (for bun to recognize the project)
COPY --chown=mvmp:mvmp package.json ./package.json

# Switch to non-root user
USER mvmp

# Default environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_RUNTIME=nodejs
ENV PRISMA_SCHEMA_PATH=prisma/schema.postgres.prisma

# Health check — Next.js responds on /
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3000}/" || exit 1

# Use tini as PID 1 for proper signal handling
ENTRYPOINT ["/usr/bin/tini", "--"]

# Default command: API server (override per-service in docker-compose)
CMD ["bun", ".next/standalone/server.js"]
