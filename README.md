# Backupr

Simple file backup tool with client-server architecture.

## Structure

This is a Yarn workspaces monorepo with the following apps:

- **apps/client** - Electron app with React, Tailwind CSS, and shadcn/ui
  - Runs in background with system tray
  - Settings interface for server host and API key configuration
  - SQLite database (via Prisma) for storing sync history and settings
  - File selection and backup period configuration

- **apps/app** - Next.js web application (unified client and server)
  - REST API for backup operations (Next.js API routes)
  - PostgreSQL database (via Prisma) to keep history of syncs
  - API key authentication
  - Backup and restore endpoints
  - Web interface for managing users, clients, backups, and logs

## Prerequisites

- Node.js 20+
- Yarn 1.22+
- PostgreSQL 12+ (for app database)

## Installation

```bash
# Install dependencies
yarn install

# Generate Prisma clients
cd apps/client && npx prisma generate
cd ../app && yarn prisma:generate
cd ../..
```

## Database Setup

### Client Database (Automatic)
The client uses SQLite, which is automatically created in the application's user data folder. No setup required!

### App Database (Manual Setup Required)
The Next.js app uses PostgreSQL. Follow these steps:

1. Install PostgreSQL
2. Create database and user:
   ```sql
   CREATE DATABASE backupr;
   CREATE USER backupr_user WITH ENCRYPTED PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE backupr TO backupr_user;
   ```

3. Configure `.env` in `apps/app/`:
   ```bash
   cp apps/app/.env.example apps/app/.env
   # Edit DATABASE_URL, SECRET_TOKEN, and BACKUP_STORAGE_DIR in .env
   ```

4. Run migrations:
   ```bash
   cd apps/app
   yarn prisma:migrate
   ```

5. Start the app:
   ```bash
   yarn dev:app
   ```

6. Create a user (for web interface access):
   Open your browser and navigate to `http://localhost:3000/auth/signin` to create your first user account.

See [docs/SERVER_SETUP.md](docs/SERVER_SETUP.md) for detailed instructions.

## Development

```bash
# Run client in development mode
yarn dev:client

# Run web app in development mode (includes API server)
yarn dev:app
```

## Build

```bash
# Build client
yarn build:client

# Build web app
yarn build:app
```

## Usage

### Client

The client is an Electron application that:
- Starts in the background with a system tray icon
- Provides a settings interface to configure server host and API key
- Allows selecting files/folders to backup and setting backup period
- Uses SQLite to store sync times, history, and settings locally

### App

The Next.js web application provides:
- Web interface for managing users, clients, backups, and logs
- REST API endpoints for backup operations:
  - `GET /api` - Health check
  - `POST /api/auth/signin` - User authentication
  - `GET /api/auth/verify` - Token verification
  - `POST /api/users` - Create user (requires JWT token)
  - `GET /api/users` - List users (requires JWT token)
  - `POST /api/clients` - Create client (requires JWT token)
  - `GET /api/clients` - List clients (requires JWT token)
  - `GET /api/ping` - Connection test (requires API key)
  - `POST /api/backup/upload` - Upload backup (requires API key)
  - `POST /api/backup/upload/start` - Start chunked upload (requires API key)
  - `POST /api/backup/upload/chunk` - Upload chunk (requires API key)
  - `POST /api/backup/upload/complete` - Complete chunked upload (requires API key)
  - `POST /api/backup/finalize` - Finalize backup (requires API key)
  - `GET /api/backup/history` - Get backup history (requires API key)
  - `GET /api/backup/names` - Get backup names (requires API key)
  - `GET /api/backup/:id` - Get backup details (requires API key)
  - `GET /api/backup/:id/file/*` - Download file from backup (requires API key)
  - `GET /api/backups` - List all backups (requires JWT token)
  - `GET /api/logs` - Get sync logs (requires JWT token)

All backup operations require `X-API-Key` header for authentication.
Web interface operations require JWT token authentication.

## Documentation

- [Development Guide](docs/DEVELOPMENT.md) - Detailed development information
- [Database Setup](docs/DATABASE.md) - Database configuration for both client and server
- [Server Setup](docs/SERVER_SETUP.md) - PostgreSQL setup guide
- [Auto-Update System](AUTO_UPDATE.md) - How to publish updates and use the auto-update feature
- [Contributing](CONTRIBUTING.md) - Contribution guidelines

## Auto-Updates

The Backupr client includes an automatic update system that checks for new releases from GitHub:
- Automatically checks for updates on startup
- Manual update check via tray menu "Check for Updates" option
- Downloads updates in the background with user confirmation
- Installs updates on app restart

See [AUTO_UPDATE.md](AUTO_UPDATE.md) for detailed documentation on how to publish updates and use the auto-update feature.

## Technology Stack

**Client:**
- Electron 28
- React 18
- Vite 5
- Tailwind CSS 3
- shadcn/ui components
- Prisma (SQLite)

**App (Web):**
- Next.js 16
- React 19
- Tailwind CSS 4
- shadcn/ui components
- Prisma (PostgreSQL)
- TypeScript
- Next.js API Routes (replacing Hono server)
