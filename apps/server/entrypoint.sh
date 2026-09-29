#!/bin/sh
set -e

cd /app/apps/server

echo "Running database migrations..."
bunx prisma migrate deploy

echo "Starting server..."
bun run dist/main.js
