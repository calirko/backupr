#!/bin/sh
set -e

echo "=== ENV CHECK ==="
echo "NODE_ENV=$NODE_ENV"
echo "DATABASE_URL=$DATABASE_URL"
echo "SERVER_URL=$SERVER_URL"
echo "MINIO_ENDPOINT=$MINIO_ENDPOINT"
echo "=================="

echo "Running database migrations..."
bunx prisma migrate deploy --schema=apps/server/prisma/schema.prisma

echo "Starting server..."
bun run apps/server/src/main.ts
