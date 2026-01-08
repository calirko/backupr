# Unified Server Setup

This guide explains how to run the Next.js frontend through the Hono backend server, creating a unified access point.

## Architecture

```
Client Request
     ↓
Hono Server (localhost:3000)
     ├─→ /api/* → API Routes (Hono handlers)
     └─→ /* → Next.js Frontend (proxied)
```

## Development Setup

### Option 1: Unified Server (Recommended)

Run both the backend and frontend through a single port:

1. **Start the Next.js dev server on port 3001:**
   ```bash
   cd apps/frontend
   npm run dev -- -p 3001
   ```

2. **Start the Hono server on port 3000:**
   ```bash
   cd apps/server
   bun run dev
   ```

3. **Access the application:**
   - Frontend: `http://localhost:3000` (proxied to Next.js)
   - API: `http://localhost:3000/api/*`

### Option 2: Separate Servers (Development Only)

If you prefer to run them separately during development:

1. **Update frontend `.env`:**
   ```env
   NEXT_PUBLIC_API_URL="http://localhost:4000"
   ```

2. **Start Next.js on default port:**
   ```bash
   cd apps/frontend
   npm run dev
   ```

3. **Start backend on port 4000:**
   ```bash
   cd apps/server
   PORT=4000 bun run dev
   ```

4. **Access:**
   - Frontend: `http://localhost:3000`
   - API: `http://localhost:4000/api/*`

## How It Works

### Development Mode
- The frontend proxy (`frontend-proxy.ts`) intercepts all non-API requests
- Requests are forwarded to the Next.js dev server running on port 3001
- API requests starting with `/api/` are handled directly by Hono
- Hot module reloading (HMR) works normally through the proxy

### Environment Variables

**Frontend (`apps/frontend/.env`):**
```env
# Empty string = use relative URLs (for unified server)
NEXT_PUBLIC_API_URL=""

# Or specify full URL (for separate servers)
# NEXT_PUBLIC_API_URL="http://localhost:4000"
```

**Backend (`apps/server/.env`):**
```env
# Port for the unified server
PORT=3000

# URL where Next.js dev server runs
NEXT_DEV_URL=http://localhost:3001
```

## Production Deployment

For production, you'll want to:

1. **Build the Next.js app:**
   ```bash
   cd apps/frontend
   npm run build
   ```

2. **Update `frontend-proxy.ts`** to serve static files instead of proxying:
   - Use `serveStatic` from `hono/bun` to serve `.next/standalone` output
   - Serve `_next/static` and `public` directories
   - Fallback to `index.html` for client-side routing

3. **Deploy as a single container/process:**
   - Single Dockerfile that builds both apps
   - Single entry point serving everything

## Benefits of Unified Server

1. **Single Port**: Simpler deployment and firewall configuration
2. **No CORS Issues**: Same origin for frontend and backend
3. **Simplified Routing**: Single point of entry
4. **Easier Auth**: Cookies and sessions work seamlessly
5. **Production Ready**: Can be containerized as a single unit

## Troubleshooting

### "Frontend Unavailable" Error
- Ensure Next.js is running on port 3001
- Check `NEXT_DEV_URL` in server environment

### API Calls Failing
- Verify `NEXT_PUBLIC_API_URL` is empty or correct
- Check that API routes start with `/api/`

### HMR Not Working
- The proxy forwards WebSocket connections for HMR
- Ensure Next.js dev server is accessible from the backend
