# Build stage
FROM oven/bun:latest AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY src ./src
COPY tsconfig.json ./
COPY prisma ./prisma

# Build the application
RUN bun build src/index.ts --outdir dist --target bun

# Runtime stage
FROM oven/bun:latest

WORKDIR /app

# Create backup directory with proper permissions
RUN mkdir -p /bkp && chmod 755 /bkp

# Copy package files from builder
COPY package.json bun.lockb* ./

# Install dependencies (production only)
RUN bun install --frozen-lockfile --production

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy prisma schema for runtime
COPY prisma ./prisma

# Copy .env if needed (optional, can be overridden at runtime)
# COPY .env* ./

# Set environment variables
ENV NODE_ENV=production
ENV BACKUP_STORAGE_DIR=/bkp

# Create necessary directories
RUN mkdir -p /bkp && chmod 755 /bkp

# Expose ports
# Default port for Hono server (change if your server uses different port)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD bun run -e "fetch('http://localhost:3000/').then(r => r.ok ? process.exit(0) : process.exit(1))"

# Run the application
CMD ["bun", "run", "dist/index.js"]
