# ##############################################################################
# TokTickIT — Unified production Dockerfile (multi-stage)
# ##############################################################################
# WHAT THIS FILE DOES
#   Builds ONE image that contains the API (Elysia on Bun) AND the built React SPA and
#   serves both on port 3000. Cloud Run (and CI) build/run exactly this image.
#   (client/Dockerfile and server/Dockerfile are separate, used only by
#    docker-compose for local development.)
#
# STRUCTURE (3 stages)
#   Stage 1  client-builder -> compiles the frontend (Vite)
#   Stage 2  server-builder -> compiles the backend (TypeScript + Prisma)
#   Stage 3  production     -> small runtime image; copies only build output
#
# ⭐ IMPORTANT
#   * The container MUST listen on $PORT (Cloud Run injects it; 3000 here) and
#     the same number is used by `--port 3000` in deploy/deploy.sh.
#   * Build from the repo root:  docker build .   (paths are relative to it).
#   * Secrets (DATABASE_URL, passwords) are NEVER baked into the image; they are
#     injected at runtime from Secret Manager (see deploy/deploy.sh).
#   * Stage 3 runs as the unprivileged `bun` user (USER bun) — keep it.
#   * prisma/ is copied into the runtime image on purpose: the Cloud Run
#     migration job runs `prisma migrate deploy` + seed from this same image.
#
# REFERENCES
#   - Multi-stage builds : https://docs.docker.com/build/building/multi-stage/
#   - Dockerfile reference: https://docs.docker.com/reference/dockerfile/
#   - Cloud Run container contract (PORT, stateless, SIGTERM):
#       https://cloud.google.com/run/docs/container-contract
#   - Prisma + Docker/alpine (openssl):
#       https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-prisma
#
# ⭐ CHANGE ME — groups using another tech stack must rewrite this file:
#   # CHANGE ME: base images (oven/bun:1-alpine) -> your runtime
#   # CHANGE ME: build commands (bun install / bun run build / prisma generate)
#   # CHANGE ME: copied paths, ENV PORT / EXPOSE, final ENTRYPOINT / CMD
# ##############################################################################

# ============================================================================
# Stage 1: Build Frontend (React + TypeScript + Vite)
# ============================================================================
# CHANGE ME: replace with your frontend toolchain (delete the stage if none).
FROM oven/bun:1-alpine AS client-builder
WORKDIR /app/client
# Copy package files first so `bun install` is cached until dependencies change.
COPY client/package.json client/bun.lock ./
RUN bun install --frozen-lockfile
COPY client/ ./
# Empty API URL => the SPA calls the API on the same origin (same container).
ENV VITE_API_URL=""
RUN bun run build

# ============================================================================
# Stage 2: Build Backend (Elysia + TypeScript + Prisma)
# ============================================================================
# CHANGE ME: replace with your backend build (compile / package your app).
FROM oven/bun:1-alpine AS server-builder
WORKDIR /app/server
# Prisma needs openssl on alpine.
RUN apk add --no-cache openssl
COPY server/package.json server/bun.lock ./
RUN bun install --frozen-lockfile
COPY server/ ./
# CHANGE ME: `prisma generate` is Prisma-specific; drop it for other ORMs.
RUN bunx prisma generate && bun run typecheck

# ============================================================================
# Stage 3: Unified Production Runtime (Serves API + Built React SPA on :3000)
# ============================================================================
# ⭐ IMPORTANT: this is the stage that actually runs on Cloud Run.
FROM oven/bun:1-alpine AS production
WORKDIR /app/server
RUN apk add --no-cache openssl

# --- Copy build output from the previous stages (no dev tooling) -------------
COPY --from=server-builder /app/server/package.json /app/server/bun.lock ./
COPY --from=server-builder /app/server/node_modules ./node_modules
COPY --from=server-builder /app/server/src ./src
COPY --from=server-builder /app/server/prisma ./prisma
COPY --from=server-builder /app/server/docker-entrypoint.sh ./docker-entrypoint.sh
# The built SPA is served by the Elysia server from /app/client/dist.
COPY --from=client-builder /app/client/dist /app/client/dist

RUN chmod +x ./docker-entrypoint.sh

# --- Runtime configuration ----------------------------------------------------
ENV NODE_ENV=production
ENV TZ=Asia/Bangkok
# CHANGE ME: PORT must match your app AND `--port` in deploy/deploy.sh (step 11).
ENV PORT=3000
EXPOSE 3000

# Do not run as root inside the container.
USER bun

# --- Start command ------------------------------------------------------------
# CHANGE ME: replace `bun src/index.ts` with your app's start command.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["bun", "src/index.ts"]
