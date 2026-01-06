const { calculateNextBackup } = require("./lib/scheduler-utils");
const { BackupTaskManager } = require("./lib/backup-task-manager");

/**
 * Backup scheduler with task manager
 */
const backupTimers = new Map(); // Map<itemId, timeoutId>

// Maximum safe setTimeout delay (24.8 days in milliseconds)
// Using a slightly smaller value to be safe
const MAX_TIMEOUT_DELAY = 2147483647; // ~24.8 days
const SAFE_TIMEOUT_DELAY = 86400000 * 20; // 20 days in milliseconds

/**
 * Global task manager instance
 */
let taskManager = null;

/**
 * Scheduler context (store and mainWindow references)
 */
let schedulerContext = {
	store: null,
	mainWindow: null,
};

/**
 * Initialize task manager
 */
function initializeTaskManager() {
	if (!taskManager) {
		taskManager = new BackupTaskManager();

		// Set up task manager event listeners
		taskManager.on("taskStatusChange", (state) => {
			const { mainWindow } = schedulerContext;
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send("task-status-update", state);
			}
		});

		taskManager.on("taskCompleted", ({ taskId, result }) => {
			console.log(`[SCHEDULER] Task ${taskId} completed successfully`);
		});

		taskManager.on("taskFailed", ({ taskId, error }) => {
			console.error(`[SCHEDULER] Task ${taskId} failed:`, error);
		});

		taskManager.on("taskRetry", ({ taskId, attempt, error }) => {
			console.log(`[SCHEDULER] Task ${taskId} retry attempt ${attempt}:`, error);
		});

		console.log("[SCHEDULER] Task manager initialized");
	}
	return taskManager;
}

/**
 * Get task manager instance
 */
function getTaskManager() {
	if (!taskManager) {
		initializeTaskManager();
	}
	return taskManager;
}

/**
 * Set scheduler context
 */
function setSchedulerContext(store, mainWindow) {
	schedulerContext.store = store;
	schedulerContext.mainWindow = mainWindow;

	// Initialize task manager with context
	initializeTaskManager();
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
	console.log(
		`[SCHEDULER] === scheduleBackup called for "${item.name}" (ID: ${item.id}) ===`,
	);
	console.log(
		`[SCHEDULER] Item enabled: ${item.enabled}, interval: ${item.interval}`,
	);

	// Clear existing timer if any
	if (backupTimers.has(item.id)) {
		console.log(`[SCHEDULER] Clearing existing timer for "${item.name}"`);
		clearTimeout(backupTimers.get(item.id));
		backupTimers.delete(item.id);
	}

	// Don't schedule if manual or disabled
	if (!item.enabled || !item.interval || item.interval === "manual") {
		console.log(
			`[SCHEDULER] Not scheduling "${item.name}" - disabled or manual`,
		);
		return;
	}

	const nextBackupTime = calculateNextBackup(
		item.interval,
		item.customHours,
		item.dailyTime,
		item.weeklyDay,
		item.weeklyTime,
	);

	console.log(
		`[SCHEDULER] Next backup time for item "${item.name}":`,
		nextBackupTime,
	);

	if (!nextBackupTime) {
		console.log(
			`[SCHEDULER] No next backup time calculated for "${item.name}"`,
		);
		return;
	}

	const now = new Date();
	console.log(
		`[SCHEDULER] Current time: ${now.toISOString()}, Next backup: ${nextBackupTime.toISOString()}`,
	);
	const timeUntilBackup = nextBackupTime.getTime() - now.getTime();
	console.log(
		`[SCHEDULER] Time until backup for "${item.name}": ${timeUntilBackup}ms (${Math.round(timeUntilBackup / 60000)} minutes)`,
	);

	// If the next backup time is in the past or very soon (within 1 minute), run immediately
	if (timeUntilBackup < 60000) {
		console.log(
			`[SCHEDULER] Backup "${item.name}" is overdue or due soon, executing now...`,
		);
		// Execute with current context (don't await to avoid blocking)
		const { store, mainWindow } = schedulerContext;
		if (store && mainWindow) {
			executeScheduledBackup(item, store, mainWindow)
				.then(() => {
					// After successful execution, reschedule will be handled by executeScheduledBackup
					console.log(
						`Immediate backup for "${item.name}" completed, next backup scheduled`,
					);
				})
				.catch((error) => {
					console.error(
						`Error in immediate backup execution for "${item.name}":`,
						error,
					);
					// Try to reschedule even if execution failed
					scheduleNextBackup(item, store);
				});
		} else {
			console.error(
				`Cannot execute immediate backup for "${item.name}": missing context`,
			);
		}
		// Don't return early - instead, schedule a recheck in case immediate execution fails
		// This ensures the item stays in the scheduler
		const recheckDelay = 300000; // 5 minutes
		console.log(
			`Scheduling recheck for "${item.name}" in 5 minutes as fallback`,
		);
		const timerId = setTimeout(() => {
			const { store } = schedulerContext;
			if (store) {
				const items = store.get("syncItems", []);
				const currentItem = items.find((i) => i.id === item.id);
				if (currentItem?.enabled) {
					scheduleBackup(currentItem);
				}
			}
		}, recheckDelay);
		backupTimers.set(item.id, timerId);
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
 * Execute a scheduled backup using task manager
 */
async function executeScheduledBackup(item, store, mainWindow) {
	console.log(
		`[SCHEDULER] Executing scheduled backup: ${item.name} (ID: ${item.id})`,
	);
	console.log(`[SCHEDULER] Current time: ${new Date().toISOString()}`);
	console.log(`[SCHEDULER] Item last backup: ${item.lastBackup || "never"}`);
	console.log(`[SCHEDULER] Item next backup: ${item.nextBackup || "not set"}`);

	try {
		// Get current settings
		const settings = {
			serverHost: store.get("serverHost", ""),
			apiKey: store.get("apiKey", ""),
		};

		if (!settings.serverHost || !settings.apiKey) {
			console.error(
				`[SCHEDULER] Cannot execute backup "${item.name}": Server settings not configured`,
			);
			// Reschedule for later
			scheduleNextBackup(item, store);
			return;
		}

		// Send initial notification to UI
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("backup-progress", {
				message: `Starting scheduled backup: ${item.name}`,
				percent: 0,
			});
		}

		// Create and execute task using task manager
		const task = await taskManager.createTask(item, settings, store, mainWindow);

		if (!task) {
			console.log(
				`[SCHEDULER] Task creation skipped for "${item.name}" (already running)`,
			);
			// Reschedule anyway
			scheduleNextBackup(item, store);
			return;
		}

		// Wait for task completion (the task manager handles execution)
		const taskCompleted = new Promise((resolve) => {
			const onComplete = ({ taskId }) => {
				if (taskId === task.id) {
					taskManager.removeListener("taskCompleted", onComplete);
					taskManager.removeListener("taskFailed", onFailed);
					resolve(true);
				}
			};
			const onFailed = ({ taskId }) => {
				if (taskId === task.id) {
					taskManager.removeListener("taskCompleted", onComplete);
					taskManager.removeListener("taskFailed", onFailed);
					resolve(false);
				}
			};
			taskManager.on("taskCompleted", onComplete);
			taskManager.on("taskFailed", onFailed);
		});

		const success = await taskCompleted;

		if (success) {
			// Update last backup time
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

			// Final completion notification
			if (mainWindow && !mainWindow.isDestroyed()) {
				setTimeout(() => {
					mainWindow.webContents.send("backup-progress", {
						message: `Scheduled backup "${item.name}" completed successfully!`,
						percent: 100,
					});
				}, 500);
			}

			// Schedule the next backup
			scheduleNextBackup(updatedItem, store);
		} else {
			console.error(`Backup "${item.name}" failed after retries`);

			// Send error notification
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send("backup-progress", {
					message: `Scheduled backup "${item.name}" failed after retries`,
					percent: 0,
					error: true,
				});
			}

			// Reschedule for next interval
			scheduleNextBackup(item, store);
		}
	} catch (error) {
		console.error(
			`Error executing scheduled backup for "${item.name}":`,
			error,
		);

		// Send error notification
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("backup-progress", {
				message: `Scheduled backup "${item.name}" error: ${error.message}`,
				percent: 0,
				error: true,
			});
		}

		// Reschedule
		scheduleNextBackup(item, store);
	}
}

/**
 * Schedule the next backup for an item
 */
function scheduleNextBackup(item, store) {
	console.log(
		`[SCHEDULER] Scheduling next backup for "${item.name}" (ID: ${item.id})`,
	);

	// Calculate and schedule the next backup
	const nextBackupTime = calculateNextBackup(
		item.interval,
		item.customHours,
		item.dailyTime,
		item.weeklyDay,
		item.weeklyTime,
	);

	console.log(
		`[SCHEDULER] Next backup time calculated for "${item.name}": ${nextBackupTime?.toISOString() || "null (manual)"}`,
	);

	if (nextBackupTime) {
		// Update the item with next backup time
		const items = store.get("syncItems", []);
		const index = items.findIndex((i) => i.id === item.id);
		if (index !== -1) {
			items[index].nextBackup = nextBackupTime.toISOString();
			store.set("syncItems", items);

			console.log(`[SCHEDULER] Updated nextBackup in store for "${item.name}"`);

			// Schedule the backup
			scheduleBackup(items[index]);
		} else {
			console.error(
				`[SCHEDULER] Could not find item "${item.name}" (ID: ${item.id}) in store to update nextBackup`,
			);
		}
	} else {
		console.log(
			`[SCHEDULER] No next backup scheduled for "${item.name}" (manual or invalid interval)`,
		);
	}
}

/**
 * Initialize scheduler for all enabled items
 */
function initializeScheduler(store, mainWindow) {
	console.log(`[SCHEDULER] ========================================`);
	console.log(`[SCHEDULER] Initializing scheduler...`);
	console.log(`[SCHEDULER] ========================================`);

	// Set the scheduler context and initialize task manager
	setSchedulerContext(store, mainWindow);

	// Load all sync items
	const items = store.get("syncItems", []);

	console.log(`[SCHEDULER] Found ${items.length} sync items in store`);

	// Check for overdue backups and schedule them
	const now = new Date();
	const overdueItems = [];

	for (const item of items) {
		console.log(`[SCHEDULER] Processing item: "${item.name}" (ID: ${item.id})`);
		console.log(`[SCHEDULER]   - enabled: ${item.enabled}`);
		console.log(`[SCHEDULER]   - interval: ${item.interval}`);
		console.log(`[SCHEDULER]   - lastBackup: ${item.lastBackup || "never"}`);
		console.log(`[SCHEDULER]   - nextBackup: ${item.nextBackup || "not set"}`);

		if (item.enabled && item.interval && item.interval !== "manual") {
			// Check if backup is overdue
			if (item.nextBackup) {
				const nextBackupTime = new Date(item.nextBackup);
				const timeDiff = nextBackupTime.getTime() - now.getTime();

				// If overdue by more than 1 minute, add to overdue list
				if (timeDiff < -60000) {
					console.log(
						`[SCHEDULER]   -> Backup is OVERDUE by ${Math.abs(Math.round(timeDiff / 60000))} minutes`,
					);
					overdueItems.push(item);
				}
			}

			// Schedule the item normally
			console.log(`[SCHEDULER]   -> Scheduling this item`);
			scheduleBackup(item);
		} else {
			console.log(`[SCHEDULER]   -> Skipping (disabled or manual)`);
		}
	}

	// Execute overdue backups immediately (one attempt each)
	if (overdueItems.length > 0) {
		console.log(
			`[SCHEDULER] Found ${overdueItems.length} overdue backups, executing immediately...`,
		);

		for (const item of overdueItems) {
			// Execute with current context (non-blocking)
			executeScheduledBackup(item, store, mainWindow).catch((error) => {
				console.error(
					`Error in overdue backup execution for "${item.name}":`,
					error,
				);
			});
		}
	}

	console.log(`[SCHEDULER] ========================================`);
	console.log(`[SCHEDULER] Scheduler initialization complete`);
	console.log(`[SCHEDULER] Active timers: ${backupTimers.size}`);
	console.log(`[SCHEDULER] Overdue backups executed: ${overdueItems.length}`);
	console.log(`[SCHEDULER] ========================================`);
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

	// Shutdown task manager
	if (taskManager) {
		taskManager.shutdown();
	}
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
	getTaskManager,
};
