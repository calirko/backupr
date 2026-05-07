FROM oven/bun:1.3.11 AS builder

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/agent/package.json ./apps/agent/package.json

RUN bun install --frozen-lockfile

COPY apps/server ./apps/server
RUN bunx prisma generate --schema=apps/server/prisma/schema.prisma

FROM oven/bun:1.3.11-slim

ARG NODE_ENV=production
ARG DATABASE_URL
ARG SERVER_URL
ARG MINIO_ENDPOINT
ARG MINIO_PORT
ARG MINIO_USE_SSL
ARG MINIO_ACCESS_KEY
ARG MINIO_SECRET_KEY
ARG MINIO_BUCKET

ENV NODE_ENV=$NODE_ENV \
    DATABASE_URL=$DATABASE_URL \
    SERVER_URL=$SERVER_URL \
    MINIO_ENDPOINT=$MINIO_ENDPOINT \
    MINIO_PORT=$MINIO_PORT \
    MINIO_USE_SSL=$MINIO_USE_SSL \
    MINIO_ACCESS_KEY=$MINIO_ACCESS_KEY \
    MINIO_SECRET_KEY=$MINIO_SECRET_KEY \
    MINIO_BUCKET=$MINIO_BUCKET

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server ./apps/server
COPY --from=builder /app/package.json ./

EXPOSE 5174

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD bun -e "fetch('http://localhost:5174/ping').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["sh", "-c", "bunx prisma migrate deploy --schema=apps/server/prisma/schema.prisma && bun run apps/server/src/main.ts"]
