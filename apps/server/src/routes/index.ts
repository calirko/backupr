import type { Hono } from "hono";
import { setupAuthRoutes } from "./auth";
import { setupBackupChunkedRoutes } from "./backup-chunked";
import { setupBackupFetchRoutes } from "./backup-fetch";
import { setupBackupUploadRoutes } from "./backup-upload";
import { setupLogsRoutes } from "./logs";
import { setupPingRoutes } from "./ping";

export function setupAllRoutes(app: Hono, BACKUP_STORAGE_DIR: string) {
	setupAuthRoutes(app);
	setupPingRoutes(app);
	setupBackupUploadRoutes(app, BACKUP_STORAGE_DIR);
	setupBackupChunkedRoutes(app, BACKUP_STORAGE_DIR);
	setupBackupFetchRoutes(app, BACKUP_STORAGE_DIR);
	setupLogsRoutes(app);
}
