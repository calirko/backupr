# Migration Guide: Hono Server to Next.js API Routes

## Overview

This migration successfully transferred the Hono server application into the Next.js application, creating a unified application that serves both the web UI and API endpoints.

## What Changed

### Directory Structure
- **Removed**: `apps/server/` - The standalone Hono server
- **Renamed**: `apps/frontend/` → `apps/app/` - Now a unified application
- **Added**: `apps/app/app/api/` - All API routes now live here

### Architecture Changes

#### Before (Separate Applications)
```
apps/
├── frontend/     # Next.js web UI
│   └── Makes HTTP calls to external server
└── server/       # Hono server (Bun)
    └── Separate API server on different port
```

#### After (Unified Application)
```
apps/
├── app/          # Next.js unified app
│   ├── app/
│   │   ├── (main)/        # Web UI pages
│   │   └── api/           # API routes (was server/)
│   ├── lib/
│   │   └── server/        # Server-side utilities
│   └── prisma/            # Database schema
└── client/       # Electron app (unchanged)
```

## API Routes Mapping

All routes maintain the same paths and functionality:

### Authentication Routes
- `POST /api/auth/signin` - User authentication
- `GET /api/auth/verify` - Token verification

### User Management (Requires JWT)
- `GET /api/users` - List users
- `POST /api/users` - Create user
- `GET /api/users/:id` - Get user details
- `PATCH /api/users/:id` - Update user
- `DELETE /api/users` - Delete users (bulk)

### Client Management (Requires JWT)
- `GET /api/clients` - List clients
- `POST /api/clients` - Create client
- `GET /api/clients/:id` - Get client details
- `PATCH /api/clients/:id` - Update client
- `DELETE /api/clients` - Delete clients (bulk)

### Backup Operations (Requires API Key)
- `GET /api/ping` - Connection test
- `POST /api/backup/upload` - Upload backup (single file)
- `POST /api/backup/upload/start` - Start chunked upload
- `POST /api/backup/upload/chunk` - Upload chunk
- `POST /api/backup/upload/complete` - Complete chunked upload
- `POST /api/backup/finalize` - Finalize backup
- `GET /api/backup/history` - Get backup history
- `GET /api/backup/names` - Get backup names
- `GET /api/backup/:id` - Get backup details
- `GET /api/backup/:id/file/*` - Download file from backup

### Backup Management (Requires JWT)
- `GET /api/backups` - List all backups
- `GET /api/backups/:id` - Get backup details
- `GET /api/backups/:id/download/:fileId` - Download specific file
- `DELETE /api/backups` - Delete backups (bulk)

### Logs (Requires JWT)
- `GET /api/logs` - Get sync logs

### Health Check
- `GET /api` - Server health check

## Technical Details

### Dependencies Added to `apps/app/package.json`
- `@prisma/client` - Database ORM
- `bcryptjs` - Password hashing
- `prisma` - Database migrations and schema management

### Environment Variables

The app now requires these environment variables (see `apps/app/.env.example`):

```bash
# Database Configuration
DATABASE_URL="postgresql://user:password@localhost:5432/backupr"

# JWT Secret Token
SECRET_TOKEN="your-secret-token-here-change-this-in-production"

# Backup Storage Directory
BACKUP_STORAGE_DIR="/path/to/backups"
```

### Authentication

Two authentication methods are supported:

1. **JWT Token** (for web interface)
   - Used by web UI for user/client/backup management
   - Set via cookies after login
   - Validated via `Authorization: Bearer <token>` header

2. **API Key** (for Electron client)
   - Used by Electron client for backup operations
   - Validated via `X-API-Key` header
   - Each client has a unique API key

### Middleware

The Next.js middleware (`apps/app/middleware.ts`) handles:
- Authentication for web pages (redirects to login if not authenticated)
- Excludes API routes (they handle their own authentication)
- Redirects `/` to `/home` for authenticated users

## Setup Instructions

### 1. Install Dependencies
```bash
cd /path/to/backupr
yarn install
```

### 2. Configure Environment
```bash
cd apps/app
cp .env.example .env
# Edit .env with your configuration
```

### 3. Setup Database
```bash
cd apps/app

# Generate Prisma client
yarn prisma:generate

# Run migrations
yarn prisma:migrate
```

### 4. Start Development Server
```bash
# From project root
yarn dev:app

# Or from apps/app
yarn dev
```

The application will be available at `http://localhost:3000`

### 5. Create First User

Navigate to `http://localhost:3000/auth/signin` and create your first user account through the web interface.

## Migration Benefits

1. **Simplified Architecture** - One application instead of two
2. **Same Origin** - No CORS issues, API and UI on same domain
3. **Easier Deployment** - Deploy single Next.js application
4. **Shared Code** - Better code reuse between UI and API
5. **Type Safety** - Full TypeScript across the stack
6. **Hot Reload** - Changes to API routes reload instantly in development

## Backward Compatibility

All API endpoints maintain the same:
- Routes and paths
- Request/response formats
- Authentication methods
- Error handling
- Business logic

The Electron client (`apps/client`) will work without any changes, as long as it points to the Next.js app URL.

## Troubleshooting

### Port Already in Use
If port 3000 is already in use, you can change it:
```bash
PORT=3001 yarn dev:app
```

### Database Connection Issues
Ensure your PostgreSQL server is running and the `DATABASE_URL` in `.env` is correct.

### Prisma Client Not Found
Regenerate the Prisma client:
```bash
cd apps/app
yarn prisma:generate
```

### Missing Environment Variables
Check that all required variables are set in `apps/app/.env`:
- `DATABASE_URL`
- `SECRET_TOKEN`
- `BACKUP_STORAGE_DIR`

## Next Steps

1. Run database migrations
2. Configure environment variables
3. Start the application
4. Create your first user
5. Test API endpoints
6. Update Electron client configuration (if needed) to point to new app URL

## Support

For issues or questions, please refer to the main [README.md](../README.md) or open an issue on GitHub.
