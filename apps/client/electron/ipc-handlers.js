const { ipcMain, dialog, app } = require("electron");
const {
	performBackupInternal,
	performFirebirdBackupInternal,
	pauseBackup,
	resumeBackup,
} = require("./backup-manager");
const { scheduleBackup } = require("./scheduler");
const { checkForUpdatesManually } = require("./auto-updater");

/**
 * Setup all IPC handlers
 */
function setupIpcHandlers(mainWindow, store, autoLauncher) {
	// Settings handlers
	ipcMain.handle("get-settings", async () => {
		return {
			serverHost: store.get("serverHost", ""),
			apiKey: store.get("apiKey", ""),
		};
	});

	ipcMain.handle("save-settings", async (_event, settings) => {
		store.set("serverHost", settings.serverHost);
		store.set("apiKey", settings.apiKey);
		return { success: true };
	});

	// Backup config handlers
	ipcMain.handle("get-backup-config", async () => {
		return store.get("backupConfig", {
			files: [],
			period: "daily",
		});
	});

	ipcMain.handle("save-backup-config", async (_event, config) => {
		store.set("backupConfig", config);
		return { success: true };
	});

	// Sync items handlers
	ipcMain.handle("get-sync-items", async () => {
		return store.get("syncItems", []);
	});

	ipcMain.handle("save-sync-item", async (_event, item) => {
		console.log(
			`[IPC] Saving sync item: "${item.name}" (ID: ${item.id || "NEW"})`,
		);
		const items = store.get("syncItems", []);

		if (item.id) {
			// Update existing item
			const index = items.findIndex((i) => i.id === item.id);
			if (index !== -1) {
				console.log(`[IPC] Updating existing item at index ${index}`);
				items[index] = item;
			} else {
				console.log(
					`[IPC] Warning: Item ID ${item.id} not found, adding as new`,
				);
				item.id = Date.now().toString();
				items.push(item);
			}
		} else {
			// Add new item with unique ID
			item.id = Date.now().toString();
			console.log(`[IPC] Adding new item with ID ${item.id}`);
			items.push(item);
		}

		store.set("syncItems", items);
		console.log(`[IPC] Saved to store. Total items: ${items.length}`);

		// Update scheduler for this item
		console.log(`[IPC] Calling scheduleBackup for "${item.name}"`);
		scheduleBackup(item);

		return { success: true, item };
	});

	ipcMain.handle("delete-sync-item", async (_event, itemId) => {
		console.log(`[IPC] Deleting sync item with ID: ${itemId}`);
		const items = store.get("syncItems", []);
		const filtered = items.filter((i) => i.id !== itemId);
		console.log(
			`[IPC] Items before: ${items.length}, after: ${filtered.length}`,
		);
		store.set("syncItems", filtered);

		// Clear the timer for only this specific item
		const { clearScheduledBackup } = require("./scheduler");
		clearScheduledBackup(itemId);
		console.log(`[IPC] Cleared scheduled backup for item ${itemId}`);

		return { success: true };
	});

	// File selection dialogs
	ipcMain.handle("select-files", async () => {
		const result = await dialog.showOpenDialog(mainWindow, {
			properties: ["openFile", "openDirectory", "multiSelections"],
		});

		return result.canceled ? [] : result.filePaths;
	});

	ipcMain.handle("select-files-only", async () => {
		const result = await dialog.showOpenDialog(mainWindow, {
			properties: ["openFile", "multiSelections"],
		});

		return result.canceled ? [] : result.filePaths;
	});

	ipcMain.handle("select-directories", async () => {
		const result = await dialog.showOpenDialog(mainWindow, {
			properties: ["openDirectory", "multiSelections"],
		});

		return result.canceled ? [] : result.filePaths;
	});

	ipcMain.handle("select-firebird-db", async () => {
		const result = await dialog.showOpenDialog(mainWindow, {
			properties: ["openFile"],
			filters: [
				{ name: "Firebird Database", extensions: ["fdb", "gdb", "ib"] },
				{ name: "All Files", extensions: ["*"] },
			],
		});

		return result.canceled ? null : result.filePaths[0];
	});

	// Backup operations
	ipcMain.handle("perform-backup", async (_event, params) => {
		return performBackupInternal(params, store, mainWindow);
	});

	ipcMain.handle("perform-firebird-backup", async (_event, params) => {
		return performFirebirdBackupInternal(params, store, mainWindow);
	});

	ipcMain.handle("pause-backup", async () => {
		pauseBackup();
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("backup-progress", {
				message: "Backup paused by user",
				percent: 0,
				paused: true,
			});
		}
		return { success: true };
	});

	ipcMain.handle("resume-backup", async () => {
		resumeBackup();
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("backup-progress", {
				message: "Backup resumed",
				percent: 0,
				paused: false,
			});
		}
		return { success: true };
	});

	// Backup history
	ipcMain.handle("get-backup-history", async () => {
		return store.get("backupHistory", []);
	});

	// Window controls
	ipcMain.handle("minimize-window", () => {
		if (mainWindow) {
			mainWindow.minimize();
		}
	});

	ipcMain.handle("close-window", () => {
		if (mainWindow) {
			mainWindow.close();
		}
	});

	// Auto-update controls
	ipcMain.handle("check-for-updates", async () => {
		return checkForUpdatesManually(store);
	});

	ipcMain.handle("get-app-version", () => {
		return app.getVersion();
	});

	// Startup behavior settings
	ipcMain.handle("get-startup-behavior", async () => {
		const isEnabled = await autoLauncher.isEnabled();
		return {
			startInBackground: store.get("startInBackground", false),
			launchOnStartup: isEnabled,
		};
	});

	ipcMain.handle("set-startup-behavior", async (_event, settings) => {
		store.set("startInBackground", settings.startInBackground);

		// Enable or disable auto-launch based on startInBackground setting
		try {
			const isEnabled = await autoLauncher.isEnabled();

			if (settings.startInBackground && !isEnabled) {
				await autoLauncher.enable();
				console.log("Auto-launch enabled");
			} else if (!settings.startInBackground && isEnabled) {
				await autoLauncher.disable();
				console.log("Auto-launch disabled");
			}
		} catch (error) {
			console.error("Error configuring auto-launch:", error);
		}

		return { success: true };
	});
}

module.exports = {
	setupIpcHandlers,
};
