# Server Database Setup Guide

This guide will walk you through setting up the PostgreSQL database for the Backupr server.

## Quick Setup (Development)

### 1. Install PostgreSQL

**macOS (Homebrew):**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**Windows:**
Download and install from [PostgreSQL Downloads](https://www.postgresql.org/download/windows/)

### 2. Create Database and User

```bash
# Access PostgreSQL as postgres user
sudo -u postgres psql

# Or on macOS/Windows
psql postgres
```

Then run these SQL commands:

```sql
-- Create database
CREATE DATABASE backupr;

-- Create user with password
CREATE USER backupr_user WITH ENCRYPTED PASSWORD 'your_secure_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE backupr TO backupr_user;

-- For PostgreSQL 15+, also grant schema privileges
\c backupr
GRANT ALL ON SCHEMA public TO backupr_user;

-- Exit
\q
```

### 3. Configure Environment

```bash
cd apps/server

# Copy example env file
cp .env.example .env

# Edit .env and update DATABASE_URL
# Replace 'password' with your actual password
nano .env
```

Your `.env` should look like:
```env
PORT=3000
DATABASE_URL="postgresql://backupr_user:your_secure_password@localhost:5432/backupr"
```

### 4. Run Migrations

```bash
# Still in apps/server directory
npx prisma migrate dev --name init
```

This will:
- Create all the necessary tables
- Generate the Prisma Client
- Seed the database (if seed file exists)

### 5. Verify Setup

```bash
# Open Prisma Studio to view your database
npx prisma studio
```

A browser window will open at http://localhost:5555 showing your database tables.

## Create Your First User (API Key)

Once the server is running, create a user to get an API key:

```bash
# Start the server
yarn dev:server

# In another terminal, create a user
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "apiKey": "test-api-key-12345"
  }'
```

Response:
```json
{
  "success": true,
  "user": {
    "id": "uuid-here",
    "name": "Test User",
    "email": "test@example.com",
    "apiKey": "test-api-key-12345"
  }
}
```

Use this `apiKey` in your client settings!

## Production Setup

### Using Docker

```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: backupr
      POSTGRES_USER: backupr_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  postgres_data:
```

Run with:
```bash
docker-compose up -d
```

### Using Managed Services

**DigitalOcean:**
1. Create a PostgreSQL database cluster
2. Get the connection string from the dashboard
3. Update `DATABASE_URL` in your `.env`

**AWS RDS:**
1. Create a PostgreSQL instance
2. Configure security groups
3. Get the endpoint and update `DATABASE_URL`

**Heroku:**
```bash
# Heroku automatically provides DATABASE_URL
heroku addons:create heroku-postgresql:hobby-dev
```

### Production Environment Variables

```env
# Production .env
PORT=3000
DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"
NODE_ENV=production
```

## Common Commands

```bash
# Generate Prisma Client (after schema changes)
npx prisma generate

# Create a new migration
npx prisma migrate dev --name migration_name

# Apply migrations (production)
npx prisma migrate deploy

# Reset database (development only - deletes all data!)
npx prisma migrate reset

# Open Prisma Studio
npx prisma studio

# Format schema file
npx prisma format

# View database schema
npx prisma db pull
```

## Database Schema

The server uses the following tables:

### User
- Stores user accounts and API keys
- One user can have many backups

### Backup
- Records of backup operations
- Links to user and contains multiple files

### BackupFile
- Individual files within a backup
- Includes file metadata (size, checksum, path)

### SyncLog
- Audit log of all backup/restore operations
- Useful for debugging and monitoring

## Troubleshooting

### "Cannot connect to database"

**Check if PostgreSQL is running:**
```bash
# Linux
sudo systemctl status postgresql

# macOS
brew services list
```

**Check if port 5432 is listening:**
```bash
sudo netstat -plnt | grep 5432
# or
sudo lsof -i :5432
```

### "Authentication failed"

1. Check username and password in `DATABASE_URL`
2. Verify PostgreSQL authentication in `pg_hba.conf`:
   ```bash
   # Find the file
   sudo find / -name pg_hba.conf 2>/dev/null
   
   # Edit it (add this line if needed)
   # local   all   backupr_user   md5
   ```
3. Reload PostgreSQL:
   ```bash
   sudo systemctl reload postgresql
   ```

### "Database does not exist"

```bash
# List all databases
psql -U postgres -l

# Create if missing
createdb -U postgres backupr
```

### "Permission denied for schema public"

For PostgreSQL 15+:
```sql
\c backupr
GRANT ALL ON SCHEMA public TO backupr_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO backupr_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO backupr_user;
```

### Migrations failing

```bash
# Check migration status
npx prisma migrate status

# Force reset (development only!)
npx prisma migrate reset

# Manually apply
npx prisma migrate deploy
```

## Backup and Restore

### Backup Database

```bash
# Full backup
pg_dump -U backupr_user backupr > backup.sql

# Schema only
pg_dump -U backupr_user -s backupr > schema.sql

# Data only
pg_dump -U backupr_user -a backupr > data.sql
```

### Restore Database

```bash
# Restore from backup
psql -U backupr_user backupr < backup.sql
```

## Maintenance

### Monitor Size

```sql
-- Database size
SELECT pg_size_pretty(pg_database_size('backupr'));

-- Table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Vacuum

```bash
# Auto-vacuum is usually enabled, but you can manually run:
psql -U backupr_user backupr -c "VACUUM ANALYZE;"
```

### Indexes

Check the schema file (`prisma/schema.prisma`) for index definitions. They're automatically created during migrations.

## Next Steps

1. ✅ Database is set up
2. ✅ First user created
3. → Configure client with server URL and API key
4. → Start backing up files!
