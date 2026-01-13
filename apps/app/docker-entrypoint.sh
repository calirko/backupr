#!/bin/sh
set -e

echo "🔄 Running Prisma migrations..."
npx prisma migrate deploy

echo "🌱 Seeding database..."
npx tsx prisma/seed.ts || echo "⚠️  Seed already exists or failed, continuing..."

echo "✅ Database setup completed"

exec "$@"
