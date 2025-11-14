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
const calculateNextBackup = (
	interval,
	customHours,
	dailyTime,
	weeklyDay,
	weeklyTime,
) => {
	const now = new Date();

	switch (interval) {
		case "manual":
			return null;
		case "hourly":
			return new Date(now.getTime() + 60 * 60 * 1000);
		case "daily": {
			// Calculate next daily backup at specified time
			const [hours, minutes] = (dailyTime || "00:00").split(":").map(Number);
			const next = new Date(now);
			next.setHours(hours, minutes, 0, 0);

			console.log("Calculated daily next backup time:", next);
			console.log("Current time:", now);
			console.log(next < now);

			// If the time today has passed, schedule for tomorrow
			if (next < now) {
				next.setDate(next.getDate() + 1);
			}
			return next;
		}
		case "weekly": {
			// Calculate next weekly backup at specified day and time
			const [hours, minutes] = (weeklyTime || "00:00").split(":").map(Number);
			const targetDay = parseInt(weeklyDay, 10) || 1;
			const next = new Date(now);
			next.setHours(hours, minutes, 0, 0);

			// Calculate days until target day
			const currentDay = next.getDay();
			let daysUntilTarget = targetDay - currentDay;

			// If target day is today but time has passed, or target is before today, go to next week
			if (daysUntilTarget < 0 || (daysUntilTarget === 0 && next <= now)) {
				daysUntilTarget += 7;
			}

			next.setDate(next.getDate() + daysUntilTarget);
			return next;
		}
		case "custom": {
			const hours = parseInt(customHours, 10) || 1;
			return new Date(now.getTime() + hours * 60 * 60 * 1000);
		}
		default:
			return null;
	}
};

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

module.exports = {
	scheduleBackup,
	executeScheduledBackup,
	scheduleNextBackup,
	initializeScheduler,
	clearAllScheduledBackups,
	calculateNextBackup,
	setSchedulerContext,
	getSchedulerContext,
};
