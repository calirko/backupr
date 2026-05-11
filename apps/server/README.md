![backupr](../../banner.png)

# server

Hono REST API + WebSocket server for backupr. Handles auth, job scheduling, agent connections, and S3 storage via MinIO.

## Dev

```bash
bun run dev      # start with hot reload at http://localhost:5174
bun run start    # production
```

## Database

```bash
bunx prisma migrate deploy   # apply migrations
bun run prisma:seed          # seed initial data
```

## Environment

```env
DATABASE_URL=postgresql://user:password@localhost:5432/backupr
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=backupr
```
