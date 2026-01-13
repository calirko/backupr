# Build stage
FROM node:20 AS builder

WORKDIR /app

# Install required packages
RUN apt-get update && \
   apt-get install -y bash openssl && \
   apt-get clean

# Copy package files
COPY package.json yarn.lock* ./

# Install dependencies
RUN yarn install --frozen-lockfile --production=false

# Build args for environment variables
ARG SECRET_TOKEN
ARG DATABASE_URL

# Set environment variables from build args
ENV SECRET_TOKEN=${SECRET_TOKEN}
ENV DATABASE_URL=${DATABASE_URL}

# Copy application files
COPY . .

RUN ls ./prisma/

# Generate Prisma client
RUN yarn prisma generate
RUN yarn prisma migrate deploy

# Run seed script using tsx
RUN npx tsx prisma/seed.ts

# Build Next.js application
RUN yarn build

# Production stage
FROM node:20 AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system nodejs && \
   adduser --system --ingroup nodejs nextjs

# Copy built application from builder stage
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

# Change ownership to nextjs user
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
   CMD node -e "require('http').get('http://localhost:3000/api/ping', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "server.js"]
