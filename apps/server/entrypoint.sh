#!/bin/sh
set -e

echo "Running database migrations..."
bunx prisma migrate deploy --schema=apps/server/prisma/schema.prisma

echo "Starting server..."
bun run apps/server/src/main.ts
