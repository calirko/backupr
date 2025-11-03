# Database Setup

The Backupr application uses different databases for the client and server:

- **Client**: SQLite (local database file)
- **Server**: PostgreSQL (centralized database)

Both are managed using **Prisma ORM** for type-safe database access and migrations.

## Client Database (SQLite)

### Overview
The client uses SQLite to store local sync history and backup configurations. The database file is automatically created in the application's user data folder.

### Location
- **Windows**: `%APPDATA%/backupr/backupr.db`
- **macOS**: `~/Library/Application Support/backupr/backupr.db`
- **Linux**: `~/.config/backupr/backupr.db`

### Setup
No manual setup required! The database is automatically created when the application first runs.

### Schema
The client database includes:
- `SyncHistory` - Records of file syncs (local tracking)
- `Setting` - Application settings
- `BackupConfig` - List of files/folders to backup

### Migrations
To update the client database schema:

```bash
cd apps/client
npx prisma migrate dev --name migration_name
npx prisma generate
```

## Server Database (PostgreSQL)

### Prerequisites
- PostgreSQL 12+ installed and running

### Installation

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
```

#### macOS (using Homebrew)
```bash
brew install postgresql@15
brew services start postgresql@15
```

#### Windows
Download from [PostgreSQL Downloads](https://www.postgresql.org/download/windows/)

### Setup Instructions

1. **Create Database**
   ```bash
   sudo -u postgres psql
   ```
   
   Then in the PostgreSQL prompt:
   ```sql
   CREATE DATABASE backupr;
   CREATE USER backupr_user WITH ENCRYPTED PASSWORD 'your_secure_password';
   GRANT ALL PRIVILEGES ON DATABASE backupr TO backupr_user;
   \q
   ```

2. **Configure Environment**
   
   Create a `.env` file in `apps/server/`:
   ```bash
   cd apps/server
   cp .env.example .env
   ```
   
   Edit `.env` and set your database URL:
   ```
   DATABASE_URL="postgresql://backupr_user:your_secure_password@localhost:5432/backupr"
   ```

3. **Run Migrations**
   ```bash
   cd apps/server
   npx prisma migrate dev
   npx prisma generate
   ```

4. **Create Initial User** (for API key)
   
   After starting the server, create a user:
   ```bash
   curl -X POST http://localhost:3000/api/users \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Your Name",
       "email": "your@email.com",
       "apiKey": "your-secure-api-key-here"
     }'
   ```

### Schema
The server database includes:
- `User` - User accounts with API keys
- `Backup` - Backup records
- `BackupFile` - Individual files in each backup
- `SyncLog` - History of all sync operations

### Prisma Studio
To view and edit database contents:

```bash
# Client database
cd apps/client
npx prisma studio

# Server database
cd apps/server
npx prisma studio
```

## Configuration Notes

### Client (SQLite)
- ✅ No configuration needed
- ✅ Automatically created on first run
- ✅ Stored in application data folder
- ✅ Managed by Prisma

### Server (PostgreSQL)
- **Development**: Use local PostgreSQL instance
- **Production**: Use managed PostgreSQL service (AWS RDS, DigitalOcean, etc.)
- **Connection Pooling**: Consider using PgBouncer for production
- **Backups**: Enable automated backups for the PostgreSQL database

## Troubleshooting

### Client Database Issues

**Database not created**
- The app needs write permissions to the user data folder
- Check application logs in Electron DevTools

**Corrupted database**
- Delete the `backupr.db` file from the user data folder
- Restart the application (it will recreate the database)

### Server Database Issues

**Connection Refused**
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql  # Linux
brew services list                # macOS

# Check if PostgreSQL is listening
sudo netstat -plnt | grep 5432
```

**Authentication Failed**
- Verify username and password in `DATABASE_URL`
- Check PostgreSQL authentication settings in `pg_hba.conf`
- Ensure user has proper privileges

**Migrations Failed**
```bash
# Reset database (development only!)
cd apps/server
npx prisma migrate reset

# Or manually drop and recreate
psql -U postgres -c "DROP DATABASE backupr;"
psql -U postgres -c "CREATE DATABASE backupr;"
npx prisma migrate dev
```

**Database Not Found**
- Ensure the database exists: `psql -U postgres -l`
- Create it if needed: `psql -U postgres -c "CREATE DATABASE backupr;"`

## Best Practices

### Security
- Use strong passwords for PostgreSQL users
- Use environment variables for credentials (never commit `.env`)
- Enable SSL for PostgreSQL connections in production
- Rotate API keys regularly

### Performance
- Add indexes for frequently queried fields (Prisma schema)
- Use connection pooling in production
- Monitor database size and performance
- Regular backups of PostgreSQL database

### Maintenance
- Run `VACUUM` periodically on PostgreSQL (automatic in most cases)
- Monitor disk space for SQLite database
- Keep Prisma and dependencies up to date
- Test migrations in development before production

