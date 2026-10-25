# syntax=docker/dockerfile:1

# The lockfile is written by npm 11 (package.json "packageManager"); npm 10 reads it as out of sync.
FROM node:22-bookworm-slim AS base
RUN npm install -g --ignore-scripts npm@11.6.0
WORKDIR /app

# ---- all dependencies (build + ingestion tooling) ----
FROM base AS deps
ENV NX_DAEMON=false NX_NO_CLOUD=true
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ---- build api + web ----
FROM deps AS build
COPY . .
RUN npm run nx -- run-many -t build -p api web

# ---- production dependencies only ----
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# ---- ingestion: migrations + docs ingestion CLI (needs git) ----
FROM deps AS ingestion
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY . .
ENV MODEL_CACHE_DIR=/app/.cache/models REPO_CACHE_DIR=/app/.cache/repos
ENTRYPOINT ["node_modules/.bin/tsx", "--tsconfig", "apps/ingestion/tsconfig.app.json", "apps/ingestion/src/main.ts"]
CMD ["status"]

# ---- app: NestJS API that also serves the Angular build ----
# Kept last: hosts that build the default target (e.g. Hugging Face Spaces) get the app.
FROM node:22-bookworm-slim AS app
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    STATIC_DIR=/app/web \
    MODEL_CACHE_DIR=/app/.cache/models
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist/apps/api ./api
COPY --from=build /app/dist/apps/web/browser ./web
# Run as the image's unprivileged "node" user (uid 1000); it needs to write the model cache.
RUN mkdir -p /app/.cache/models && chown -R node:node /app/.cache
USER node
EXPOSE 3000
CMD ["node", "api/main.js"]
