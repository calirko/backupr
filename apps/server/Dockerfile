# Build stage: install deps, generate prisma client, bundle
FROM oven/bun:1.3.11-slim AS builder

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN bun install --frozen-lockfile

COPY apps/server ./apps/server

RUN cd apps/server && bunx prisma generate

RUN bun build apps/server/src/main.ts \
      --target bun \
      --outdir apps/server/dist \
      --format esm \
      --minify \
    && bun install --production --cwd apps/server

# Production stage
FROM oven/bun:1.3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma
COPY apps/server/prisma.config.ts ./apps/server/prisma.config.ts
COPY apps/server/entrypoint.sh ./apps/server/entrypoint.sh

EXPOSE 5174

ENV NODE_ENV=production
ENV BUN_GC=aggressive

ENTRYPOINT ["sh", "apps/server/entrypoint.sh"]
