FROM node:20

WORKDIR /app

# Build args for environment variables
ARG SECRET_TOKEN
ARG DATABASE_URL

# Set environment variables from build args
ENV SECRET_TOKEN=${SECRET_TOKEN}
ENV DATABASE_URL=${DATABASE_URL}
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

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

# Build Next.js application (normal mode)
RUN yarn build

EXPOSE 3000

# Make entrypoint executable
RUN chmod +x docker-entrypoint.sh

# Run migrations/seed at start-up, then launch the Next.js server.
# The WebSocket endpoint (/client-ws) is initialised inside pages/api/ws on the
# first request – no custom server wrapper needed.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["yarn", "start"]
CMD ["node", "server.js"]
