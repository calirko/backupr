FROM oven/bun:1.3.11

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/agent/package.json ./apps/agent/package.json

RUN bun install --frozen-lockfile

COPY apps/server ./apps/server

RUN cd apps/server && bunx prisma generate
RUN chmod +x apps/server/entrypoint.sh

EXPOSE 5174

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD bun -e "fetch('http://localhost:5174/ping').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

ENTRYPOINT ["sh", "apps/server/entrypoint.sh"]
