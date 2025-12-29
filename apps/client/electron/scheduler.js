const {
	performBackupInternal,
	performFirebirdBackupInternal,
} = require("./backup-manager");

const { calculateNextBackup } = require("./lib/scheduler-utils");

/**
 * Backup scheduler
 */
const backupTimers = new Map(); // Map<itemId, timeoutId>

// Maximum safe setTimeout delay (24.8 days in milliseconds)
// Using a slightly smaller value to be safe
const MAX_TIMEOUT_DELAY = 2147483647; // ~24.8 days
const SAFE_TIMEOUT_DELAY = 86400000 * 20; // 20 days in milliseconds

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

	const nextBackupTime = calculateNextBackup(
		item.interval,
		item.customHours,
		item.dailyTime,
		item.weeklyDay,
		item.weeklyTime,
	);

	console.log(`Next backup time for item "${item.name}":`, nextBackupTime);

	if (!nextBackupTime) {
		return;
	}

	const now = new Date();
	console.log(nextBackupTime, now, item);
	const timeUntilBackup = nextBackupTime.getTime() - now.getTime();

	// If the next backup time is in the past or very soon (within 1 minute), run immediately
	if (timeUntilBackup < 60000) {
		console.log(`Backup "${item.name}" is overdue, executing now...`);
		// Execute with current context (don't await to avoid blocking)
		const { store, mainWindow } = schedulerContext;
		if (store && mainWindow) {
			executeScheduledBackup(item, store, mainWindow).catch((error) => {
				console.error(
					`Error in immediate backup execution for "${item.name}":`,
					error,
				);
				// Try to reschedule even if execution failed
				scheduleNextBackup(item, store);
			});
		}
		return;
	}

	// Check if the delay exceeds the safe setTimeout limit
	// If it does, schedule a recheck instead of the actual backup
	let actualDelay = timeUntilBackup;
	let isRecheckSchedule = false;

	if (timeUntilBackup > SAFE_TIMEOUT_DELAY) {
		actualDelay = SAFE_TIMEOUT_DELAY;
		isRecheckSchedule = true;
		console.log(
			`Backup "${item.name}" is scheduled too far in future (${Math.round(timeUntilBackup / 1000 / 60 / 60 / 24)} days). ` +
				`Scheduling a recheck in ${Math.round(actualDelay / 1000 / 60 / 60 / 24)} days instead.`,
		);
	} else {
		console.log(
			`Scheduling backup "${item.name}" for ${nextBackupTime.toISOString()} (in ${Math.round(timeUntilBackup / 1000 / 60)} minutes)`,
		);
	}

	const timerId = setTimeout(() => {
		// Get current context when timer fires
		const { store, mainWindow } = schedulerContext;
		if (!store || !mainWindow) {
			console.error(`Scheduler context lost for "${item.name}"`);
			return;
		}

		if (isRecheckSchedule) {
			// This was a recheck, not the actual backup time
			// Reload the item and reschedule
			console.log(`Rechecking schedule for "${item.name}"...`);
			const items = store.get("syncItems", []);
			const currentItem = items.find((i) => i.id === item.id);
			if (currentItem?.enabled) {
				scheduleBackup(currentItem);
			}
		} else {
			// This is the actual backup time
			executeScheduledBackup(item, store, mainWindow).catch((error) => {
				console.error(
					`Error in scheduled backup execution for "${item.name}":`,
					error,
				);
				// Try to reschedule even if execution failed
				scheduleNextBackup(item, store);
			});
		}
	}, actualDelay);

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

		// Send initial notification to UI (the detailed progress will be handled by backup-manager)
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("backup-progress", {
				message: `Starting scheduled backup: ${item.name}`,
				percent: 0,
			});
		}

		let result;

		// Execute backup using the same internal functions that handle all progress updates
		if (item.backupType === "firebird") {
			// Execute Firebird backup - performFirebirdBackupInternal handles all progress updates
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
			// Execute normal file backup - performBackupInternal handles all progress updates
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

			// The final progress update is already sent by backup-manager,
			// but we can send an additional completion notification
			if (mainWindow && !mainWindow.isDestroyed()) {
				// Small delay to ensure the 100% progress from backup-manager is shown first
				setTimeout(() => {
					mainWindow.webContents.send("backup-progress", {
						message: `Scheduled backup "${item.name}" completed successfully!`,
						percent: 100,
					});
				}, 500);
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

			// Reschedule for later
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
	const nextBackupTime = calculateNextBackup(
		item.interval,
		item.customHours,
		item.dailyTime,
		item.weeklyDay,
		item.weeklyTime,
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

/**
 * Clear a specific scheduled backup by item ID
 */
function clearScheduledBackup(itemId) {
	if (backupTimers.has(itemId)) {
		console.log(`Clearing scheduled backup for item: ${itemId}`);
		clearTimeout(backupTimers.get(itemId));
		backupTimers.delete(itemId);
	}
}

module.exports = {
	scheduleBackup,
	executeScheduledBackup,
	scheduleNextBackup,
	initializeScheduler,
	clearAllScheduledBackups,
	clearScheduledBackup,
	setSchedulerContext,
	getSchedulerContext,
};
