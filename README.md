![backupr](banner.png)

Self-hosted backup platform. Agents run on your machines, connect to a central server over WebSocket, execute scheduled backup jobs, and upload archives to S3-compatible storage. A React dashboard gives you full control.

---

## Architecture

```
Browser
  └── Nginx Proxy (port 80)
        ├── /api/*  →  Server (Hono, port 5174)
        │                 ├── PostgreSQL
        │                 ├── MinIO / S3
        │                 └── WebSocket (/api/agent/ws)
        │                           ↑
        │                     Agent binaries
        │                     (Linux / Windows)
        └── /*      →  Web (React SPA, port 5173)
```

- **`apps/web`** - React 19 SPA dashboard (Vite)
- **`apps/server`** - REST API + WebSocket server (Hono + Bun)
- **`apps/agent`** - daemon that runs on client machines (Rust, compiled native binary for Linux/Windows)
- **`apps/proxy`** - Nginx reverse proxy

---

## Quick start (local dev)

### Prerequisites

- [Bun](https://bun.sh) 1.3+
- PostgreSQL
- MinIO or any S3-compatible storage

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment

`apps/server/.env`
```env
DATABASE_URL=postgresql://user:password@localhost:5432/backupr
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=backupr
```

`apps/web/.env`
```env
API_URL=http://localhost:5174
WS_URL=ws://localhost:5174
```

### 3. Run migrations and seed

```bash
cd apps/server
bunx prisma migrate deploy
bun run prisma:seed
cd ../..
```

### 4. Start services

```bash
# Terminal 1 - API + WebSocket server
cd apps/server && bun run dev

# Terminal 2 - Web dashboard
cd apps/web && bun run dev
```

Web dashboard: `http://localhost:5173`  
API: `http://localhost:5174`

---

## Docker Compose

```bash
docker compose up --build
```

Spins up `server`, `web`, and `proxy`. Expects a running PostgreSQL and MinIO instance reachable from the containers. Configure via a `.env` file at the repo root.

---

## Agent setup

Windows: see `apps/agent/README.md` for the install one-liner (installs as a service via WinSW).

Linux, or if you already have the binary: download or build it for your platform, then run setup once:

```bash
# Linux
./backupr-agent setup <pairing-code>

# Windows
backupr-agent.exe setup <pairing-code>
```

Generate the pairing code from the dashboard under **Agents → Add Agent**. After setup the agent connects automatically and stays connected via WebSocket.

### Build agent binaries

```bash
cd apps/agent
./scripts/build-all.sh   # cross-compiles Linux + Windows binaries into apps/agent/out/
```

See `apps/agent/README.md` for building individual targets manually with `cargo build`.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, React Router 7, Vite, Tailwind CSS 4 |
| Backend | Hono 4, Bun, Prisma 7, PostgreSQL |
| Storage | MinIO (S3-compatible) |
| Agent | Rust (compiled native binary, Linux + Windows) |
| Proxy | Nginx |
| Monorepo | Yarn workspaces + Bun runtime |
