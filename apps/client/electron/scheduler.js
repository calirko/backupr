const {
	performBackupInternal,
	performFirebirdBackupInternal,
} = require("./backup-manager");

/**
 * Backup scheduler
 */
const backupTimers = new Map(); // Map<itemId, timeoutId>

/**
 * Scheduler context (store and mainWindow references)
 */
let schedulerContext = {
	store: null,
	mainWindow: null,
};

/**
 * Set scheduler context
 */
function setSchedulerContext(store, mainWindow) {
	schedulerContext.store = store;
	schedulerContext.mainWindow = mainWindow;
}

/**
 * Get scheduler context
 */
function getSchedulerContext() {
	return schedulerContext;
}

/**
 * Calculate next backup time based on interval
 */
function calculateNextBackupTime(interval, customHours, lastBackup) {
	if (!interval || interval === "manual") {
		return null;
	}

	const baseTime = lastBackup ? new Date(lastBackup) : new Date();
	let intervalMs = 0;

	switch (interval) {
		case "hourly":
			intervalMs = 60 * 60 * 1000; // 1 hour
			break;
		case "daily":
			intervalMs = 24 * 60 * 60 * 1000; // 24 hours
			break;
		case "weekly":
			intervalMs = 7 * 24 * 60 * 60 * 1000; // 7 days
			break;
		case "custom": {
			const hours = parseInt(customHours, 10) || 12;
			intervalMs = hours * 60 * 60 * 1000;
			break;
		}
		default:
			return null;
	}

	return new Date(baseTime.getTime() + intervalMs);
}

/**
 * Schedule a backup for an item
 */
function scheduleBackup(item) {
	// Clear existing timer if any
	if (backupTimers.has(item.id)) {
		clearTimeout(backupTimers.get(item.id));
		backupTimers.delete(item.id);
	}

	// Don't schedule if manual or disabled
	if (!item.enabled || !item.interval || item.interval === "manual") {
		return;
	}

	const nextBackupTime = calculateNextBackupTime(
		item.interval,
		item.customHours,
		item.lastBackup,
	);

	if (!nextBackupTime) {
		return;
	}

	const now = new Date();
	const timeUntilBackup = nextBackupTime.getTime() - now.getTime();

	// If the next backup time is in the past or very soon (within 1 minute), run immediately
	if (timeUntilBackup < 60000) {
		console.log(`Backup "${item.name}" is overdue, executing now...`);
		// Execute with current context
		const { store, mainWindow } = schedulerContext;
		if (store && mainWindow) {
			executeScheduledBackup(item, store, mainWindow);
		}
		return;
	}

	// Schedule the backup
	console.log(
		`Scheduling backup "${item.name}" for ${nextBackupTime.toISOString()} (in ${Math.round(timeUntilBackup / 1000 / 60)} minutes)`,
	);

	const timerId = setTimeout(() => {
		// Get current context when timer fires
		const { store, mainWindow } = schedulerContext;
		if (store && mainWindow) {
			executeScheduledBackup(item, store, mainWindow);
		}
	}, timeUntilBackup);

	backupTimers.set(item.id, timerId);
}

/**
 * Execute a scheduled backup
 */
async function executeScheduledBackup(item, store, mainWindow) {
	console.log(`Executing scheduled backup: ${item.name}`);

	try {
		// Get current settings
		const settings = {
			serverHost: store.get("serverHost", ""),
			apiKey: store.get("apiKey", ""),
		};

		if (!settings.serverHost || !settings.apiKey) {
			console.error("Cannot execute backup: Server settings not configured");
			// Reschedule for later
			scheduleNextBackup(item, store);
			return;
		}

		// Send notification to UI if window is available
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("backup-progress", {
				message: `Starting scheduled backup: ${item.name}`,
				percent: 0,
			});
		}

		let result;

		if (item.backupType === "firebird") {
			// Execute Firebird backup
			result = await performFirebirdBackupInternal(
				{
					serverHost: settings.serverHost,
					apiKey: settings.apiKey,
					backupName: item.name,
					dbPath: item.firebirdDbPath,
					gbakPath: item.gbakPath || undefined,
				},
				store,
				mainWindow,
			);
		} else {
			// Execute normal file backup
			result = await performBackupInternal(
				{
					serverHost: settings.serverHost,
					apiKey: settings.apiKey,
					backupName: item.name,
					files: item.paths,
				},
				store,
				mainWindow,
			);
		}

		if (result.success) {
			// Update last backup time and schedule next
			const updatedItem = {
				...item,
				lastBackup: new Date().toISOString(),
			};

			// Save updated item
			const items = store.get("syncItems", []);
			const index = items.findIndex((i) => i.id === item.id);
			if (index !== -1) {
				items[index] = updatedItem;
				store.set("syncItems", items);
			}

			console.log(`Backup "${item.name}" completed successfully`);

			// Send success notification to UI
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send("backup-progress", {
					message: `Scheduled backup "${item.name}" completed successfully!`,
					percent: 100,
				});
			}

			// Schedule the next backup based on the new lastBackup time
			scheduleNextBackup(updatedItem, store);
		} else {
			console.error(`Backup "${item.name}" failed:`, result.error);

			// Send error notification to UI
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send("backup-progress", {
					message: `Scheduled backup "${item.name}" failed: ${result.error}`,
					percent: 0,
					error: true,
				});
			}

			// Reschedule for later (retry after 1 hour)
			scheduleNextBackup(item, store);
		}
	} catch (error) {
		console.error(
			`Error executing scheduled backup for "${item.name}":`,
			error,
		);

		// Send error notification to UI
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("backup-progress", {
				message: `Scheduled backup "${item.name}" error: ${error.message}`,
				percent: 0,
				error: true,
			});
		}

		// Reschedule for later
		scheduleNextBackup(item, store);
	}
}

/**
 * Schedule the next backup for an item
 */
function scheduleNextBackup(item, store) {
	// Calculate and schedule the next backup
	const nextBackupTime = calculateNextBackupTime(
		item.interval,
		item.customHours,
		item.lastBackup,
	);

	if (nextBackupTime) {
		// Update the item with next backup time
		const items = store.get("syncItems", []);
		const index = items.findIndex((i) => i.id === item.id);
		if (index !== -1) {
			items[index].nextBackup = nextBackupTime.toISOString();
			store.set("syncItems", items);

			// Schedule the backup
			scheduleBackup(items[index]);
		}
	}
}

/**
 * Initialize scheduler for all enabled items
 */
function initializeScheduler(store, mainWindow) {
	// Set the scheduler context
	setSchedulerContext(store, mainWindow);

	// Load all sync items and schedule enabled ones
	const items = store.get("syncItems", []);

	console.log(`Initializing scheduler for ${items.length} sync items...`);

	for (const item of items) {
		if (item.enabled && item.interval && item.interval !== "manual") {
			scheduleBackup(item);
		}
	}
}

/**
 * Clear all scheduled backups
 */
function clearAllScheduledBackups() {
	console.log("Clearing all scheduled backups...");
	for (const timerId of backupTimers.values()) {
		clearTimeout(timerId);
	}
	backupTimers.clear();
}

module.exports = {
	scheduleBackup,
	executeScheduledBackup,
	scheduleNextBackup,
	initializeScheduler,
	clearAllScheduledBackups,
	calculateNextBackupTime,
	setSchedulerContext,
	getSchedulerContext,
};
