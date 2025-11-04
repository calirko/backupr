# Quick Start Guide

## Server Setup (5 minutes)

1. **Install dependencies:**
   ```bash
   cd apps/server
   bun install
   ```

2. **Configure database:**
   Create `.env` file:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/backupr"
   PORT=3000
   BACKUP_STORAGE_DIR="./backups"
   ```

3. **Run migrations:**
   ```bash
   bun run prisma:migrate
   ```

4. **Start server:**
   ```bash
   bun run dev
   ```

5. **Create a client:**
   ```bash
   bun run cli add-client --name "My Computer" --email "me@example.com"
   ```
   
   **Save the API key!**

## Client Setup (5 minutes)

1. **Install dependencies:**
   ```bash
   cd apps/client
   npm install
   ```

2. **Run in development:**
   ```bash
   npm run dev
   ```

3. **Configure in the app:**
   - Go to **Settings** tab
   - Server Host: `http://localhost:3000`
   - API Key: (paste from server CLI)
   - Click **Save Settings**

4. **Create a backup:**
   - Go to **Backup** tab
   - Backup Name: `Test Backup`
   - Click **Add File/Folder** to select files
   - Click **Backup Now**

## Build Windows Executable

```bash
cd apps/client
npm run build:win
```

The executable will be in `apps/client/out/`

## Verify Everything Works

1. Server is running: `curl http://localhost:3000`
2. Client connects successfully (Settings tab shows "Settings Saved!")
3. Backup uploads successfully
4. Check server folder: `backups/My-Computer/Test-Backup/v1/`

## Troubleshooting

- **Database connection error**: Check PostgreSQL is running and DATABASE_URL is correct
- **Client can't connect**: Verify server is running on correct port
- **Invalid API key**: Regenerate key with `bun run cli regenerate-key --name "My Computer"`
- **Upload fails**: Check BACKUP_STORAGE_DIR has write permissions
