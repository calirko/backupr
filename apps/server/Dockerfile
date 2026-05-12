# Build stage
FROM oven/bun:1.3.11 AS builder

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN bun install --frozen-lockfile

COPY apps/server ./apps/server

RUN cd apps/server && bunx prisma generate

# Bundle stage - create optimized production bundle
FROM oven/bun:1.3.11 AS bundler

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server ./apps/server

WORKDIR /app/apps/server

RUN bun build --target bun --outdir dist --format esm src/main.ts && \
    bun install --production

# Production stage - minimal runtime
FROM oven/bun:1.3.11-distroless

WORKDIR /app

# Copy only production node_modules
COPY --from=bundler /app/node_modules ./node_modules
COPY --from=bundler /app/apps/server/node_modules ./apps/server/node_modules

# Copy bundled output and prisma files
COPY --from=bundler /app/apps/server/dist ./apps/server/dist
COPY --from=bundler /app/apps/server/prisma ./apps/server/prisma

COPY apps/server/entrypoint.sh ./apps/server/entrypoint.sh

EXPOSE 5174

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD bun -e "fetch('http://localhost:5174/ping').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

ENV NODE_ENV=production
ENV BUN_GC=aggressive

ENTRYPOINT ["sh", "apps/server/entrypoint.sh"]
