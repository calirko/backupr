FROM oven/bun:1.3.11-slim

ARG NODE_ENV=production
ARG API_URL
ARG WS_URL

ENV NODE_ENV=$NODE_ENV
ENV API_URL=$API_URL
ENV WS_URL=$WS_URL

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY apps/agent/package.json ./apps/agent/package.json

RUN bun install --frozen-lockfile

COPY apps/web ./apps/web

WORKDIR /app/apps/web

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://localhost:5173').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))" || exit 1

CMD ["bun", "run", "dev", "--config", "vite.config.docker.ts"]
