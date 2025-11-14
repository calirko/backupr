const { app, BrowserWindow } = require("electron");
const Store = require("electron-store");
const AutoLaunch = require("auto-launch");

// Import modules
const { createWindow, createTray } = require("./window-manager");
const { setupIpcHandlers } = require("./ipc-handlers");
const {
	configureAutoUpdater,
	setupAutoUpdaterHandlers,
	checkForUpdatesOnStartup,
} = require("./auto-updater");
const {
	initializeScheduler,
	clearAllScheduledBackups,
} = require("./scheduler");

const store = new Store();
let mainWindow = null;

// Configure auto-launch for system startup
const autoLauncher = new AutoLaunch({
	name: "Backupr",
	path: process.execPath,
});

// Configure auto-updater
configureAutoUpdater();

// Single instance lock - prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
	// If another instance is already running, quit this one
	app.quit();
} else {
	// Handle second instance attempt
	app.on("second-instance", (_event, _commandLine, _workingDirectory) => {
		// Someone tried to run a second instance, we should focus our window
		if (mainWindow) {
			if (mainWindow.isMinimized()) {
				mainWindow.restore();
			}
			if (!mainWindow.isVisible()) {
				mainWindow.show();
			}
			mainWindow.focus();
		}
	});
}

/**
 * Initialize auto-launch based on user settings
 */
async function initializeAutoLaunch() {
	try {
		const startInBackground = store.get("startInBackground", false);
		const isEnabled = await autoLauncher.isEnabled();

		console.log(
			`Auto-launch status - Setting: ${startInBackground}, System: ${isEnabled}`,
		);

		if (startInBackground && !isEnabled) {
			await autoLauncher.enable();
			console.log("Auto-launch enabled");
		} else if (!startInBackground && isEnabled) {
			await autoLauncher.disable();
			console.log("Auto-launch disabled");
		}
	} catch (error) {
		console.error("Error initializing auto-launch:", error);
	}
}

/**
 * App ready handler
 */
app.whenReady().then(() => {
	// Create window and tray
	mainWindow = createWindow();

	// Set startInBackground flag on window for use in ready-to-show event
	mainWindow._startInBackground = store.get("startInBackground", false);

	tray = createTray(mainWindow, store);

	// Setup IPC handlers
	setupIpcHandlers(mainWindow, store, autoLauncher);

	// Setup auto-updater handlers
	setupAutoUpdaterHandlers(mainWindow, store);

	// Initialize auto-launch based on saved settings
	initializeAutoLaunch();

	// Initialize the backup scheduler after app is ready
	initializeScheduler(store, mainWindow);

	// Check for updates on startup
	checkForUpdatesOnStartup();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			mainWindow = createWindow();
			mainWindow._startInBackground = store.get("startInBackground", false);
		}
	});
});

/**
 * Window all closed handler
 */
app.on("window-all-closed", () => {
	// Keep app running in background on all platforms
	// Don't quit when all windows are closed
});

/**
 * Before quit handler
 */
app.on("before-quit", () => {
	app.isQuitting = true;

	// Clear all scheduled backups when quitting
	clearAllScheduledBackups();
});
