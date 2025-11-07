# Backupr

Simple file backup tool with client-server architecture.

## Structure

This is a Yarn workspaces monorepo with the following apps:

- **apps/client** - Electron app with React, Tailwind CSS, and shadcn/ui
  - Runs in background with system tray
  - Settings interface for server host and API key configuration
  - SQLite database (via Prisma) for storing sync history and settings
  - File selection and backup period configuration

- **apps/server** - Bun server with Hono framework
  - REST API for backup operations
  - PostgreSQL database (via Prisma) to keep history of syncs
  - API key authentication
  - Backup and restore endpoints

## Prerequisites

- Node.js 20+
- Yarn 1.22+
- Bun 1.0+
- PostgreSQL 12+ (for server database)

## Installation

```bash
# Install dependencies
yarn install

# Generate Prisma clients
cd apps/client && npx prisma generate
cd ../server && npx prisma generate
cd ../..
```

## Database Setup

### Client Database (Automatic)
The client uses SQLite, which is automatically created in the application's user data folder. No setup required!

### Server Database (Manual Setup Required)
The server uses PostgreSQL. Follow these steps:

1. Install PostgreSQL
2. Create database and user:
   ```sql
   CREATE DATABASE backupr;
   CREATE USER backupr_user WITH ENCRYPTED PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE backupr TO backupr_user;
   ```

3. Configure `.env` in `apps/server/`:
   ```bash
   cp apps/server/.env.example apps/server/.env
   # Edit DATABASE_URL in .env
   ```

4. Run migrations:
   ```bash
   cd apps/server
   npx prisma migrate dev
   ```

5. Create a user (for API key):
   ```bash
   # Start the server first
   yarn dev:server
   
   # Then create user
   curl -X POST http://localhost:3000/api/users \
     -H "Content-Type: application/json" \
     -d '{"name":"Your Name","email":"you@example.com","apiKey":"your-secure-key"}'
   ```

See [docs/SERVER_SETUP.md](docs/SERVER_SETUP.md) for detailed instructions.

## Development

```bash
# Run client in development mode
yarn dev:client

# Run server in development mode
yarn dev:server
```

## Build

```bash
# Build client
yarn build:client

# Build server
yarn build:server
```

## Usage

### Client

The client is an Electron application that:
- Starts in the background with a system tray icon
- Provides a settings interface to configure server host and API key
- Allows selecting files/folders to backup and setting backup period
- Uses SQLite to store sync times, history, and settings locally

### Server

The Bun server provides REST API endpoints:
- `GET /` - Health check
- `POST /api/users` - Create user (get API key)
- `POST /api/backup` - Submit backup (requires API key)
- `GET /api/backup/history` - Get backup history (requires API key)
- `GET /api/backup/:id` - Get backup details (requires API key)
- `POST /api/restore` - Restore from backup (requires API key)
- `GET /api/logs` - Get sync logs (requires API key)

All backup/restore endpoints require `X-API-Key` header for authentication.

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

**Server:**
- Bun 1.x
- Hono framework
- Prisma (PostgreSQL)
- TypeScript
