# Backupr

Simple file backup tool with client-server architecture.

## Structure

This is a Yarn workspaces monorepo with the following apps:

- **apps/client** - Electron app with React, Tailwind CSS, and shadcn/ui
  - Runs in background with system tray
  - Settings interface for server host and API key configuration
  - MySQL database for storing sync history and settings
  - File selection and backup period configuration

- **apps/server** - Bun server with Hono framework
  - REST API for backup operations
  - API key authentication
  - Backup and restore endpoints

## Prerequisites

- Node.js 20+
- Yarn 1.22+
- Bun 1.0+
- MySQL database (for client)

## Installation

```bash
# Install dependencies
yarn install
```

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
- Uses MySQL to store sync times, history, and settings

### Server

The Bun server provides REST API endpoints:
- `GET /` - Health check
- `POST /api/backup` - Submit backup
- `GET /api/backup/history` - Get backup history
- `GET /api/backup/:id` - Get backup details
- `POST /api/restore` - Restore from backup

All API endpoints require `X-API-Key` header for authentication.
