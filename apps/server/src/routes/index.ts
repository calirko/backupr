import type { Hono } from "hono";
import { setupAuthRoutes } from "./auth";
import { setupBackupChunkedRoutes } from "./backup-chunked";
import { setupBackupFetchRoutes } from "./backup-fetch";
import { setupBackupUploadRoutes } from "./backup-upload";
import { setupBackupsRoutes } from "./backups";
import { setupClientsRoutes } from "./clients";
import { setupFrontendProxy } from "./frontend-proxy";
import { setupLogsRoutes } from "./logs";
import { setupPingRoutes } from "./ping";
import { setupUsersRoutes } from "./users";

export function setupAllRoutes(app: Hono, BACKUP_STORAGE_DIR: string) {
	// API routes first (they take priority)
	setupAuthRoutes(app);
	setupPingRoutes(app);
	setupUsersRoutes(app);
	setupClientsRoutes(app);
	setupBackupsRoutes(app, BACKUP_STORAGE_DIR);
	setupLogsRoutes(app);
	setupBackupUploadRoutes(app, BACKUP_STORAGE_DIR);
	setupBackupChunkedRoutes(app, BACKUP_STORAGE_DIR);
	setupBackupFetchRoutes(app, BACKUP_STORAGE_DIR);

	// Frontend proxy last (catches all remaining routes)
	setupFrontendProxy(app);
}
