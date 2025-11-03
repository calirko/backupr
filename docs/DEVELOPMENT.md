# Development Guide

This guide will help you get started with developing the Backupr application.

## Architecture

Backupr is a monorepo consisting of two main applications:

### Client (Electron + React)
- **Framework**: Electron 28.x with React 18.x
- **UI**: Tailwind CSS with shadcn/ui components
- **Build Tool**: Vite
- **Database**: MySQL for local data storage
- **Features**:
  - System tray integration
  - Background operation
  - Settings management
  - File backup configuration

### Server (Bun + Hono)
- **Runtime**: Bun 1.x
- **Framework**: Hono (lightweight web framework)
- **Features**:
  - REST API for backup operations
  - API key authentication
  - Backup and restore endpoints

## Getting Started

### Prerequisites

- Node.js 20+
- Yarn 1.22+
- Bun 1.0+
- MySQL 5.7+ (for client database)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd backupr

# Install dependencies
yarn install
```

### Running in Development

#### Server

```bash
# Start the server in watch mode
yarn dev:server

# The server will start on http://localhost:3000
```

#### Client

```bash
# Start the client in development mode
yarn dev:client

# This will:
# 1. Start Vite dev server on http://localhost:5173
# 2. Launch Electron app connected to the dev server
```

### Building for Production

```bash
# Build server
yarn build:server

# Build client
yarn build:client
```

### Running Production Builds

```bash
# Run server
yarn start:server

# Run client (packaged Electron app)
yarn start:client
```

## Project Structure

```
backupr/
├── apps/
│   ├── client/                 # Electron + React app
│   │   ├── electron/          # Electron main process
│   │   │   ├── main.js        # Main process entry
│   │   │   └── preload.js     # Preload script
│   │   ├── src/               # React app source
│   │   │   ├── components/    # React components
│   │   │   │   ├── ui/       # shadcn/ui components
│   │   │   │   ├── Backup.jsx
│   │   │   │   └── Settings.jsx
│   │   │   ├── lib/          # Utilities
│   │   │   │   ├── database.js
│   │   │   │   └── utils.js
│   │   │   ├── App.jsx       # Main app component
│   │   │   ├── main.jsx      # React entry point
│   │   │   └── index.css     # Global styles
│   │   ├── public/           # Static assets
│   │   ├── index.html        # HTML template
│   │   ├── vite.config.js    # Vite configuration
│   │   └── tailwind.config.js
│   │
│   └── server/                # Bun server
│       ├── src/
│       │   └── index.ts       # Server entry point
│       ├── package.json
│       └── tsconfig.json
│
├── docs/                      # Documentation
├── package.json              # Root workspace config
└── README.md
```

## Key Components

### Client Components

#### Settings.jsx
Manages application settings:
- Server host configuration
- API key management
- MySQL database configuration

#### Backup.jsx
Handles backup configuration:
- File/folder selection
- Backup period settings
- Configuration persistence

#### Database (lib/database.js)
Provides MySQL integration:
- Connection management
- Table creation
- Sync history tracking
- Settings storage

### Server Endpoints

- `GET /` - Health check
- `POST /api/backup` - Submit backup (requires API key)
- `GET /api/backup/history` - Get backup history (requires API key)
- `GET /api/backup/:id` - Get backup details (requires API key)
- `POST /api/restore` - Restore from backup (requires API key)

## Development Tips

### Hot Reload

- **Client**: Vite provides hot module replacement (HMR) for React components
- **Server**: Bun's watch mode automatically restarts on file changes

### Debugging

#### Client
```bash
# Electron DevTools are available in development mode
# Press Cmd/Ctrl+Shift+I to open
```

#### Server
```bash
# Add console.log statements
# They will appear in the terminal running the server
```

### Testing API Endpoints

```bash
# Health check
curl http://localhost:3000

# Backup (with API key)
curl -X POST http://localhost:3000/api/backup \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"files":["path/to/file"],"metadata":{}}'

# Get history
curl http://localhost:3000/api/backup/history \
  -H "X-API-Key: your-api-key"
```

## Common Tasks

### Adding a New shadcn/ui Component

```bash
# Components are manually added in src/components/ui/
# Follow the existing pattern for consistency
```

### Modifying Electron Main Process

Edit `apps/client/electron/main.js` for:
- Window management
- System tray behavior
- IPC handlers

### Adding Server Endpoints

Edit `apps/server/src/index.ts` to add new routes:

```typescript
app.get('/api/new-endpoint', validateApiKey, async (c) => {
  return c.json({ data: 'your data' });
});
```

## Troubleshooting

### Client won't start
- Check if port 5173 is available
- Ensure all dependencies are installed
- Check Electron version compatibility

### Server won't start
- Check if port 3000 is available
- Ensure Bun is installed correctly
- Check for syntax errors in TypeScript files

### Database connection issues
- See [DATABASE.md](./DATABASE.md) for database setup
- Verify MySQL is running
- Check credentials in settings

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

See LICENSE file in the repository root.
