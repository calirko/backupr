FROM oven/bun:latest

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy all necessary files
COPY package.json bun.lockb* ./
COPY src ./src
COPY prisma ./prisma

# Install dependencies
RUN bun install

# Generate Prisma client
RUN bun run prisma:generate

# Build arguments
ARG DATABASE_URL
ARG BACKUP_STORAGE_DIR=/bkp
ARG PORT=3000

# Environment variables
ENV DATABASE_URL=${DATABASE_URL}
ENV BACKUP_STORAGE_DIR=${BACKUP_STORAGE_DIR}
ENV PORT=${PORT}

# Create backup directory
RUN mkdir -p ${BACKUP_STORAGE_DIR}

# Expose port
EXPOSE ${PORT}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
   CMD bun run -e "fetch('http://localhost:${PORT}').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run migrations and start server
CMD bun run prisma:migrate && bun run dev
