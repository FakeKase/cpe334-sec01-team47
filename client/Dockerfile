# ==============================================================================
# YuemPuenMa — Frontend Dockerfile for local Docker Compose (Vite + nginx)
# ==============================================================================
# Used by docker-compose.yml (`client` service on http://localhost:5173).
# Cloud Run does NOT use this file — Cloud Run serves the built SPA from the
# root `Dockerfile`.
# Ref: https://docs.docker.com/build/building/multi-stage/
#
# ⭐ CHANGE ME (groups using another frontend tool):
#   # CHANGE ME: build image / commands and the output folder (`/app/dist`).
# ==============================================================================

# --- Stage 1: Build static frontend files -------------------------------------
# CHANGE ME: base image and build commands for your frontend.
FROM oven/bun:1.4.5-alpine AS build
WORKDIR /app/client

# The build context is the repository root (see docker-compose.yml), because the
# lockfile belongs to the workspace root. --filter installs only this package's deps.
COPY package.json bun.lock /app/
COPY client/package.json /app/client/
COPY server/package.json /app/server/
RUN cd /app && bun install --frozen-lockfile --ignore-scripts --filter cpe334-team47-client

COPY client/ ./
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
RUN bun run build

# --- Stage 2: Serve built files with nginx (proxies /api -> server:3000) ------
FROM nginx:stable-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
# CHANGE ME: replace `/app/dist` if your bundler outputs to another folder.
COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
