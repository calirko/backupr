# Backupr - File Backup System

A client-server backup system with automatic versioning and Windows executable support.

## Overview

Backupr consists of two main components:
- **Server**: A Bun-based backend with PostgreSQL database that stores backups organized by client
- **Client**: An Electron desktop application for Windows/Mac/Linux that uploads files to the server

## Features

- 📁 **File Organization**: Backups are organized by client name and backup set name
- 🔄 **Version Control**: Automatic versioning for each backup with full history
- 🔐 **API Key Authentication**: Secure client authentication using generated API keys
- 📦 **Multi-platform Client**: Electron app that works on Windows, macOS, and Linux
- 🖥️ **CLI Management**: Command-line tools for managing sync clients

## Server Setup

### Prerequisites

- Bun runtime installed
- PostgreSQL database

### Installation

```bash
cd apps/server
bun install
```

### Configuration

Create a `.env` file in `apps/server`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/backupr"
PORT=3000
BACKUP_STORAGE_DIR="/path/to/backups"
```

### Database Setup

```bash
cd apps/server
bun run prisma:migrate
bun run prisma:generate
```

### Running the Server

```bash
# Development mode with auto-reload
bun run dev

# Production mode
bun run start
```

## Server CLI

The server includes a CLI for managing sync clients.

### Add a New Client

Create a new sync client and generate an API key:

```bash
bun run cli add-client --name "John's Laptop" --email "john@example.com"
```

This will output:
```
✅ Client created successfully!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Client Name:  John's Laptop
Email:        john@example.com
API Key:      a1b2c3d4e5f6...
Folder Path:  /backups/Johns-Laptop
Created:      2025-11-03T19:57:33.000Z
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  IMPORTANT: Save this API key! It cannot be retrieved later.
```

### List All Clients

```bash
# Basic list
bun run cli list-clients

# Show API keys (verbose)
bun run cli list-clients --verbose
```

### Get Client Information

```bash
bun run cli client-info --name "John's Laptop"
```

### Regenerate API Key

```bash
bun run cli regenerate-key --name "John's Laptop"
```

### Remove a Client

```bash
# Show warning
bun run cli remove-client --name "John's Laptop"

# Actually remove (with confirmation bypass)
bun run cli remove-client --name "John's Laptop" --force
```

## Client Application

### Prerequisites

- Node.js 18+ or Bun

### Installation

```bash
cd apps/client
npm install
# or
bun install
```

### Development

```bash
npm run dev
# or
bun run dev
```

### Configuration

1. Open the application
2. Go to the **Settings** tab
3. Enter:
   - **Server Host**: `http://your-server:3000`
   - **API Key**: The API key generated from the server CLI
4. Click **Save Settings**

### Creating Backups

1. Go to the **Backup** tab
2. Enter a **Backup Name** (e.g., "My Documents")
3. Click **Add File/Folder** to select files/directories
4. Click **Backup Now** to upload

Each backup is automatically versioned. Subsequent backups with the same name will increment the version number.

### Building for Production

#### Build for Current Platform

```bash
npm run build && npm run package
```

#### Build Windows Executable

```bash
npm run build:win
```

This creates a Windows installer and portable executable in the `out/` directory.

#### Build for Other Platforms

```bash
# macOS
npm run build && npx electron-builder --mac

# Linux
npm run build && npx electron-builder --linux
```

## Backup File Organization

Backups are stored on the server in the following structure:

```
backups/
├── Johns-Laptop/
│   ├── My Documents/
│   │   ├── v1/
│   │   │   ├── file1.txt
│   │   │   └── file2.pdf
│   │   ├── v2/
│   │   │   ├── file1.txt
│   │   │   ├── file2.pdf
│   │   │   └── file3.docx
│   │   └── v3/
│   │       └── ...
│   └── Photos/
│       ├── v1/
│       └── v2/
└── Marias-Desktop/
    └── Work Files/
        └── v1/
```

## API Endpoints

### Authentication

All requests require the `X-API-Key` header.

### Upload Backup

```
POST /api/backup/upload
Content-Type: multipart/form-data
X-API-Key: <api-key>

Body:
- backupName: string
- metadata: JSON string (optional)
- file_0, file_1, ...: files to backup
```

### Get Backup History

```
GET /api/backup/history?limit=50&backupName=My%20Documents
X-API-Key: <api-key>
```

### Get Backup Names

```
GET /api/backup/names
X-API-Key: <api-key>
```

### Get Backup Details

```
GET /api/backup/:id
X-API-Key: <api-key>
```

### Download File

```
GET /api/backup/:id/file/:filepath
X-API-Key: <api-key>
```

### Get Sync Logs

```
GET /api/logs?limit=100
X-API-Key: <api-key>
```

## Development

### Project Structure

```
backupr/
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.ts       # Main server
│   │   │   └── cli.ts         # CLI tool
│   │   ├── prisma/
│   │   │   └── schema.prisma  # Database schema
│   │   └── package.json
│   └── client/
│       ├── electron/
│       │   ├── main.js        # Electron main process
│       │   └── preload.js     # Preload script
│       ├── src/
│       │   ├── App.jsx
│       │   └── components/
│       │       ├── Backup.jsx
│       │       └── Settings.jsx
│       └── package.json
└── README.md
```

### Database Schema

The system uses the following models:

- **Client**: Registered sync clients with API keys
- **Backup**: Backup records with version numbers
- **BackupFile**: Individual file records within backups
- **SyncLog**: Activity logs for each client

## Security

- All client requests must include a valid API key
- API keys are 64-character hex strings (256-bit security)
- Each client can only access their own backups
- File paths are validated to prevent directory traversal

## License

See LICENSE file for details.
