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

# Build Prisma client and run migrations/seed
RUN yarn prisma generate && \
   yarn prisma migrate deploy && \
   npx tsx prisma/seed.ts

# Build Next.js application
RUN yarn build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["yarn", "start"]
