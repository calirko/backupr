<p align="center">
  <img src="apps/app/public/icon.png" alt="Backupr icon" width="120" />
</p>

<h1 align="center">Backupr</h1>

<p align="center">
  Self-hosted backup platform with an Electron client, a Next.js app/API, and a dedicated WebSocket service.
</p>

## What is Backupr?

Backupr is a monorepo with three apps that work together:

- `apps/client`: desktop backup client (Electron + React)
- `apps/app`: web dashboard + HTTP API (Next.js + Prisma)
- `apps/ws`: standalone WebSocket server for real-time client/frontend events

The core flow is simple: the desktop client uploads backups, the app stores metadata and serves management APIs, and the WS service keeps dashboard state live.

## Basic functionality

- Register and manage users/clients from the web dashboard
- Generate and use per-client API keys
- Upload and finalize backups (including chunked upload flows)
- Browse backup history and logs
- Trigger backups from the dashboard through WebSocket
- Download backup files from stored snapshots

## Prerequisites

- Node.js 20+
- Yarn 1.22+
- PostgreSQL 12+

## Quick start (local development)

### 1) Install dependencies

```bash
yarn install
```

### 2) Configure environment variables

Create env files for the app and WS service.

`apps/app/.env`

```env
DATABASE_URL=postgresql://backupr_user:your_password@localhost:5432/backupr
SECRET_TOKEN=change-me
BACKUP_STORAGE_DIR=/absolute/path/to/backups
NEXT_PUBLIC_WS_URL=ws://localhost:4001
```

`apps/ws/.env`

```env
DATABASE_URL=postgresql://backupr_user:your_password@localhost:5432/backupr
SECRET_TOKEN=change-me
WS_PORT=4001
```

### 3) Run database migrations

```bash
cd apps/app
yarn prisma:migrate
cd ../..
```

### 4) Start each service

Use separate terminals:

```bash
# Terminal 1 - Web app + HTTP API
yarn dev:app

# Terminal 2 - WebSocket service
yarn dev:ws

# Terminal 3 - Electron client
yarn dev:client
```

After startup:

- Web app: `http://localhost:3000`
- Sign in page: `http://localhost:3000/auth/signin`
- WebSocket service: `ws://localhost:4001`

## Run with Docker Compose

The repository includes `docker-compose.yml` for the app + WS stack.

```bash
docker compose up --build
```

Notes:

- The compose file expects a pre-existing Docker network via `DOCKER_NETWORK`.
- Backups are mounted from `BACKUP_HOST_DIR` to `BACKUP_STORAGE_DIR`.
- The desktop client is typically run outside Docker.

## Scripts

From repository root:

- `yarn dev:app` - run Next.js app in dev mode
- `yarn dev:ws` - run WebSocket server in watch mode
- `yarn dev:client` - run Electron client + Vite dev server
- `yarn build:app` - build app
- `yarn build:client` - build desktop client
- `yarn start:app` - start production app build
- `yarn start:ws` - start WebSocket service
- `yarn start:client` - start desktop client (after build)

## API and auth at a glance

- Dashboard endpoints use session/JWT auth.
- Client backup endpoints use API key auth via `X-API-Key`.
- Real-time updates and backup triggers flow through the standalone WS service.

## Tech stack

- Monorepo: Yarn workspaces
- Dashboard/API: Next.js 16, React 19, TypeScript, Prisma, PostgreSQL
- Desktop client: Electron, React, Vite, Tailwind
- Real-time layer: Node.js + ws

## Contributing

1. Fork the repository.
2. Create a feature branch from `main`.
3. Make focused changes with clear commit messages.
4. Run the services you changed and verify behavior manually.
5. Open a pull request with:
   - What changed
   - Why it changed
   - How to test it

Please keep PRs small and scoped. If your change affects API behavior, include request/response examples in the PR description.
