FROM oven/bun:latest

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --production

# Copy source code
COPY src ./src
COPY prisma ./prisma

# Build the application
RUN bun run build

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

# Create startup script with Prisma operations
RUN echo '#!/bin/bash\n\
echo "Generating Prisma client..."\n\
bun run prisma generate\n\
if [ $? -ne 0 ]; then\n\
  echo "Prisma generate failed, exiting..."\n\
  exit 1\n\
fi\n\
echo "Running Prisma migrations..."\n\
bun run prisma migrate deploy\n\
if [ $? -ne 0 ]; then\n\
  echo "Migration failed, exiting..."\n\
  exit 1\n\
fi\n\
echo "Starting server..."\n\
exec bun run dist/index.js' > /app/start.sh && chmod +x /app/start.sh

# Expose port
EXPOSE ${PORT}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
   CMD bun run -e "fetch('http://localhost:${PORT}').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run the application with startup script
CMD ["/app/start.sh"]