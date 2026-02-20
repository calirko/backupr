const { app, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");

/**
 * Configure auto-updater
 */
function configureAutoUpdater() {
	autoUpdater.autoDownload = false; // Don't auto-download, ask user first
	autoUpdater.autoInstallOnAppQuit = true; // Install update when app quits
}

/**
 * Helper function to send status messages to window
 */
function sendStatusToWindow(mainWindow, text) {
	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.webContents.send("update-status", text);
	}
}

/**
 * Setup auto-updater event handlers
 */
function setupAutoUpdaterHandlers(mainWindow, store) {
	autoUpdater.on("checking-for-update", () => {
		console.log("Checking for updates...");
		sendStatusToWindow(mainWindow, "Checking for updates...");
	});

	autoUpdater.on("update-available", (info) => {
		console.log("Update available:", info.version);
		sendStatusToWindow(mainWindow, `Update available: ${info.version}`);

		// Show dialog to user
		if (mainWindow) {
			dialog
				.showMessageBox(mainWindow, {
					type: "info",
					title: "Update Available",
					message: `A new version (${info.version}) is available!`,
					detail: "Would you like to download and install it?",
					buttons: ["Download", "Later"],
					defaultId: 0,
					cancelId: 1,
				})
				.then((result) => {
					if (result.response === 0) {
						// User clicked "Download"
						autoUpdater.downloadUpdate();
						sendStatusToWindow(mainWindow, "Downloading update...");
					}
				});
		}
	});

	autoUpdater.on("update-not-available", (info) => {
		console.log("Update not available:", info.version);
		sendStatusToWindow(mainWindow, "You are running the latest version.");

		// Only show dialog if user manually checked for updates
		if (mainWindow && store.get("manualUpdateCheck")) {
			dialog.showMessageBox(mainWindow, {
				type: "info",
				title: "No Updates",
				message: "You are already running the latest version!",
				detail: `Current version: ${info.version}`,
				buttons: ["OK"],
			});
			store.set("manualUpdateCheck", false);
		}
	});

	autoUpdater.on("error", (err) => {
		console.error("Update error:", err);
		sendStatusToWindow(mainWindow, `Update error: ${err.message}`);

		if (mainWindow && store.get("manualUpdateCheck")) {
			dialog.showMessageBox(mainWindow, {
				type: "error",
				title: "Update Error",
				message: "Failed to check for updates",
				detail: err.message,
				buttons: ["OK"],
			});
			store.set("manualUpdateCheck", false);
		}
	});

	autoUpdater.on("download-progress", (progressObj) => {
		const message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent.toFixed(2)}% (${progressObj.transferred}/${progressObj.total})`;
		console.log(message);
		sendStatusToWindow(mainWindow, message);

		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("update-download-progress", {
				percent: progressObj.percent,
				transferred: progressObj.transferred,
				total: progressObj.total,
			});
		}
	});

	autoUpdater.on("update-downloaded", (info) => {
		console.log("Update downloaded:", info.version);
		sendStatusToWindow(mainWindow, "Update downloaded. Will install on quit.");

		// Show dialog to user
		if (mainWindow) {
			dialog
				.showMessageBox(mainWindow, {
					type: "info",
					title: "Update Ready",
					message: `Version ${info.version} has been downloaded!`,
					detail:
						"The update will be installed when you quit and restart the application. Would you like to restart now?",
					buttons: ["Restart Now", "Later"],
					defaultId: 0,
					cancelId: 1,
				})
				.then((result) => {
					if (result.response === 0) {
						// User clicked "Restart Now"
						app.isQuitting = true;
						autoUpdater.quitAndInstall(false, true);
					}
				});
		}
	});
}

/**
 * Check for updates on startup
 */
function checkForUpdatesOnStartup() {
	// Check for updates on startup (only in production)
	if (!process.env.ELECTRON_START_URL) {
		// Wait a few seconds before checking for updates to allow app to fully initialize
		setTimeout(() => {
			console.log("Checking for updates on startup...");
			autoUpdater.checkForUpdates().catch((err) => {
				console.error("Failed to check for updates:", err);
			});
		}, 3000);
	}
}

/**
 * Check for updates manually
 */
async function checkForUpdatesManually(store) {
	store.set("manualUpdateCheck", true);
	try {
		const result = await autoUpdater.checkForUpdates();
		return { success: true, updateInfo: result?.updateInfo };
	} catch (error) {
		console.error("Check for updates error:", error);
		return { success: false, error: error.message };
	}
}

module.exports = {
	configureAutoUpdater,
	setupAutoUpdaterHandlers,
	checkForUpdatesOnStartup,
	checkForUpdatesManually,
};
