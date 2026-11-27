# ==============================================================================
# YuemPuenMa — Backend Dockerfile for local Docker Compose (server + migrate)
# ==============================================================================
# Used by docker-compose.yml (`server` and `migrate` services).
# Cloud Run does NOT use this file — Cloud Run uses the root `Dockerfile`.
# Ref: https://docs.docker.com/reference/dockerfile/
#
# ⭐ CHANGE ME (groups using another tech stack):
#   # CHANGE ME: base image (oven/bun:1.4.4-alpine), install commands,
#   #            copied folders (prisma, src), PORT and CMD.
# ==============================================================================

# CHANGE ME: base image for your backend runtime.
FROM oven/bun:1.4.5-alpine
WORKDIR /app/server
# Prisma requires openssl on alpine.
RUN apk add --no-cache openssl

# --- Install dependencies (cached until package*.json changes) ----------------
# The build context is the repository root (see docker-compose.yml), because the
# lockfile belongs to the workspace root. --filter installs only this package's deps.
COPY package.json bun.lock /app/
COPY client/package.json /app/client/
COPY server/package.json /app/server/
RUN cd /app && bun install --frozen-lockfile --ignore-scripts --filter cpe334-team47-server

# --- Generate Prisma client ---------------------------------------------------
# CHANGE ME: remove or replace if your stack does not use Prisma.
COPY server/prisma ./prisma/
RUN bunx prisma generate

# --- Copy source (Bun runs TypeScript directly, there is no build step) -------
COPY server/tsconfig.json ./
COPY server/src ./src/
COPY server/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

# --- Runtime settings ---------------------------------------------------------
ENV NODE_ENV=production
ENV TZ=Asia/Bangkok
# CHANGE ME: port your backend listens on (must match docker-compose.yml).
ENV PORT=3000
EXPOSE 3000

# Run as non-root user.
USER bun

# CHANGE ME: start command for your backend.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["bun", "src/index.ts"]
