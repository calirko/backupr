FROM oven/bun:1-slim

WORKDIR /app

COPY package.json bun.lock ./

COPY apps/web ./apps/web

RUN bun install --frozen-lockfile

WORKDIR /app/apps/web

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://localhost:5173').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))" || exit 1

CMD ["bun", "run", "dev", "--config", "vite.config.docker.ts"]
