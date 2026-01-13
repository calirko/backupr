FROM node:20

WORKDIR /app

# Build args for environment variables
ARG SECRET_TOKEN
ARG DATABASE_URL

# Set environment variables from build args
ENV SECRET_TOKEN=${SECRET_TOKEN}
ENV DATABASE_URL=${DATABASE_URL}

# Install required packages
RUN apt-get update && \
   apt-get install -y bash openssl && \
   apt-get clean

# Copy package files and install dependencies
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile

# Copy application files
COPY . .

# Generate Prisma client only (no migrations/seed during build)
RUN yarn prisma generate

# Build Next.js application
RUN yarn build

EXPOSE 3000

# Make entrypoint executable
RUN chmod +x docker-entrypoint.sh

# Use entrypoint to run migrations/seed at runtime, then start the server
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", ".next/standalone/server.js"]
