# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json yarn.lock* ./

# Install dependencies
RUN yarn install --frozen-lockfile --production=false

# Copy application files
COPY . .

# Generate Prisma client
RUN yarn prisma generate

# Build Next.js application
RUN yarn build

# Compile seed script
RUN yarn tsc prisma/seed.ts --outDir prisma --module commonjs --target es2020 --esModuleInterop --skipLibCheck

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Build args for environment variables
ARG SECRET_TOKEN
ARG DATABASE_URL

# Set environment variables from build args
ENV SECRET_TOKEN=${SECRET_TOKEN}
ENV DATABASE_URL=${DATABASE_URL}

# Copy built application from builder stage
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=nextjs:nodejs docker-entrypoint.sh /app/docker-entrypoint.sh

# Make entrypoint executable
RUN chmod +x /app/docker-entrypoint.sh

# Change ownership to nextjs user
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
   CMD node -e "require('http').get('http://localhost:3000/api/ping', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Entrypoint script
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Start application
CMD ["node", "server.js"]
