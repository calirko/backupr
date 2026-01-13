#!/bin/sh
set -e

echo "🔄 Running Prisma migrations..."
node /app/node_modules/.bin/prisma migrate deploy --skip-generate

echo "🌱 Seeding database..."
node /app/prisma/seed.js

echo "✅ Database setup completed"

exec "$@"
