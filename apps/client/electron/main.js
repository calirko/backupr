const { app, BrowserWindow, Tray, Menu, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const Store = require("electron-store");
const { autoUpdater } = require("electron-updater");

const store = new Store();
let mainWindow = null;
let tray = null;

// Configure auto-updater
autoUpdater.autoDownload = false; // Don't auto-download, ask user first
autoUpdater.autoInstallOnAppQuit = true; // Install update when app quits

// Auto-updater event handlers
autoUpdater.on("checking-for-update", () => {
	console.log("Checking for updates...");
	sendStatusToWindow("Checking for updates...");
});

autoUpdater.on("update-available", (info) => {
	console.log("Update available:", info.version);
	sendStatusToWindow(`Update available: ${info.version}`);

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
					sendStatusToWindow("Downloading update...");
				}
			});
	}
});

autoUpdater.on("update-not-available", (info) => {
	console.log("Update not available:", info.version);
	sendStatusToWindow("You are running the latest version.");

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
	sendStatusToWindow(`Update error: ${err.message}`);

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
	sendStatusToWindow(message);

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
	sendStatusToWindow("Update downloaded. Will install on quit.");

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

// Helper function to send status messages to window
function sendStatusToWindow(text) {
	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.webContents.send("update-status", text);
	}
}

// Backup scheduler
const backupTimers = new Map(); // Map<itemId, timeoutId>

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

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 500,
		height: 600,
		minHeight: 600,
		minWidth: 500,
		maxHeight: 900,
		maxWidth: 800,
		show: false,
		frame: false, // Remove window frame
		autoHideMenuBar: true, // Remove menu bar
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(__dirname, "preload.js"),
		},
	});

	mainWindow.setMenu(null);

	// Remove the menu bar completely
	Menu.setApplicationMenu(null);

	// Load the app
	const startUrl =
		process.env.ELECTRON_START_URL ||
		`file://${path.join(__dirname, "../dist/index.html")}`;
	mainWindow.loadURL(startUrl);

	// Show window when ready
	mainWindow.once("ready-to-show", () => {
		if (!store.get("startInBackground")) {
			mainWindow.show();
		}
	});

	// handle crashes
	mainWindow.webContents.on("crashed", () => {
		mainWindow.reload();
	});

	// Hide on close instead of quitting
	mainWindow.on("close", (event) => {
		if (!app.isQuitting) {
			event.preventDefault();
			mainWindow.hide();
		}
		return false;
	});
}

function createTray() {
	// Determine the correct icon path based on platform and environment
	let iconPath;
	if (process.platform === "win32") {
		// For Windows, use ICO format
		iconPath = app.isPackaged
			? path.join(process.resourcesPath, "tray-icon.ico")
			: path.join(__dirname, "../build/tray-icon.ico");
	} else if (process.platform === "darwin") {
		// For macOS
		iconPath = app.isPackaged
			? path.join(process.resourcesPath, "tray.png")
			: path.join(__dirname, "../build/tray.png");
	} else {
		// For Linux
		iconPath = app.isPackaged
			? path.join(process.resourcesPath, "tray.png")
			: path.join(__dirname, "../build/tray.png");
	}

	// Log the icon path for debugging
	console.log("Tray icon path:", iconPath);
	console.log("Icon exists:", fs.existsSync(iconPath));
	console.log("Is packaged:", app.isPackaged);
	console.log("Resources path:", process.resourcesPath);

	// Verify icon exists before creating tray
	if (!fs.existsSync(iconPath)) {
		console.error("Tray icon not found at:", iconPath);
		// Try alternative path for Windows
		if (process.platform === "win32" && app.isPackaged) {
			const altPath = path.join(
				path.dirname(process.execPath),
				"resources",
				"tray-icon.ico",
			);
			console.log("Trying alternative path:", altPath);
			if (fs.existsSync(altPath)) {
				iconPath = altPath;
			}
		}
	}

	tray = new Tray(iconPath);

	const contextMenu = Menu.buildFromTemplate([
		{
			label: "Backupr",
			enabled: false,
			icon: iconPath,
		},
		{
			type: "separator",
		},
		{
			label: "Show Backupr",
			click: () => {
				mainWindow.show();
				mainWindow.focus();
			},
		},
		{
			label: "Hide Backupr",
			click: () => {
				mainWindow.hide();
			},
		},
		{ type: "separator" },
		{
			label: "Backup Now",
			click: () => {
				mainWindow.show();
				mainWindow.focus();
				mainWindow.webContents.send("trigger-backup");
			},
		},
		{ type: "separator" },
		{
			label: "Check for Updates",
			click: () => {
				store.set("manualUpdateCheck", true);
				autoUpdater.checkForUpdates();
			},
		},
		{ type: "separator" },
		{
			label: "Quit Backupr",
			click: () => {
				app.isQuitting = true;
				app.quit();
			},
		},
	]);

	tray.setToolTip("Backupr - File Backup");
	tray.setContextMenu(contextMenu);

	// Platform-specific behavior
	if (process.platform === "win32") {
		// Windows: Right-click shows menu, left-click toggles window
		tray.on("click", () => {
			if (mainWindow.isVisible()) {
				mainWindow.hide();
			} else {
				mainWindow.show();
				mainWindow.focus();
			}
		});
	} else {
		// macOS/Linux: Handle double-click to show/hide window
		tray.on("double-click", () => {
			if (mainWindow.isVisible()) {
				mainWindow.hide();
			} else {
				mainWindow.show();
				mainWindow.focus();
			}
		});

		// Single click shows the window
		tray.on("click", () => {
			mainWindow.show();
			mainWindow.focus();
		});
	}
}

// IPC handlers for database operations and settings
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

// Get all sync items
ipcMain.handle("get-sync-items", async () => {
	return store.get("syncItems", []);
});

// Save a sync item
ipcMain.handle("save-sync-item", async (_event, item) => {
	const items = store.get("syncItems", []);

	if (item.id) {
		// Update existing item
		const index = items.findIndex((i) => i.id === item.id);
		if (index !== -1) {
			items[index] = item;
		}
	} else {
		// Add new item with unique ID
		item.id = Date.now().toString();
		items.push(item);
	}

	store.set("syncItems", items);

	// Update scheduler for this item
	scheduleBackup(item);

	return { success: true, item };
});

// Delete a sync item
ipcMain.handle("delete-sync-item", async (_event, itemId) => {
	const items = store.get("syncItems", []);
	const filtered = items.filter((i) => i.id !== itemId);
	store.set("syncItems", filtered);

	// Clear the timer for this item
	if (backupTimers.has(itemId)) {
		clearTimeout(backupTimers.get(itemId));
		backupTimers.delete(itemId);
	}

	return { success: true };
});

// File selection dialog
ipcMain.handle("select-files", async () => {
	const result = await dialog.showOpenDialog(mainWindow, {
		properties: ["openFile", "openDirectory", "multiSelections"],
	});

	return result.canceled ? [] : result.filePaths;
});

// Select files only (no directories)
ipcMain.handle("select-files-only", async () => {
	const result = await dialog.showOpenDialog(mainWindow, {
		properties: ["openFile", "multiSelections"],
	});

	return result.canceled ? [] : result.filePaths;
});

// Select directories only
ipcMain.handle("select-directories", async () => {
	const result = await dialog.showOpenDialog(mainWindow, {
		properties: ["openDirectory", "multiSelections"],
	});

	return result.canceled ? [] : result.filePaths;
});

// Select single Firebird database file
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

// Backup Scheduler Functions
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
		executeScheduledBackup(item);
		return;
	}

	// Schedule the backup
	console.log(
		`Scheduling backup "${item.name}" for ${nextBackupTime.toISOString()} (in ${Math.round(timeUntilBackup / 1000 / 60)} minutes)`,
	);

	const timerId = setTimeout(() => {
		executeScheduledBackup(item);
	}, timeUntilBackup);

	backupTimers.set(item.id, timerId);
}

async function executeScheduledBackup(item) {
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
			scheduleNextBackup(item);
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
			result = await performFirebirdBackupInternal({
				serverHost: settings.serverHost,
				apiKey: settings.apiKey,
				backupName: item.name,
				dbPath: item.firebirdDbPath,
				gbakPath: item.gbakPath || undefined,
			});
		} else {
			// Execute normal file backup
			result = await performBackupInternal({
				serverHost: settings.serverHost,
				apiKey: settings.apiKey,
				backupName: item.name,
				files: item.paths,
			});
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
			scheduleNextBackup(updatedItem);
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
			scheduleNextBackup(item);
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
		scheduleNextBackup(item);
	}
}

function scheduleNextBackup(item) {
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

function initializeScheduler() {
	// Load all sync items and schedule enabled ones
	const items = store.get("syncItems", []);

	console.log(`Initializing scheduler for ${items.length} sync items...`);

	for (const item of items) {
		if (item.enabled && item.interval && item.interval !== "manual") {
			scheduleBackup(item);
		}
	}
}

function clearAllScheduledBackups() {
	console.log("Clearing all scheduled backups...");
	for (const timerId of backupTimers.values()) {
		clearTimeout(timerId);
	}
	backupTimers.clear();
}

// Helper function for chunked file upload
async function uploadFileInChunks(
	serverHost,
	apiKey,
	backupName,
	filePath,
	fileName,
	sendProgress,
) {
	const fetch = require("node-fetch");
	const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
	const fileStats = fs.statSync(filePath);
	const fileSize = fileStats.size;
	const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

	try {
		// Step 1: Start upload session
		sendProgress(`Starting upload for ${fileName}...`, 0);
		const startResponse = await fetch(`${serverHost}/api/backup/upload/start`, {
			method: "POST",
			headers: {
				"X-API-Key": apiKey,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				backupName,
				fileName,
				fileSize,
				totalChunks,
			}),
		});

		if (!startResponse.ok) {
			throw new Error(`Failed to start upload: ${await startResponse.text()}`);
		}

		const { sessionId, version } = await startResponse.json();

		// Step 2: Upload chunks
		const fileHandle = fs.openSync(filePath, "r");
		const buffer = Buffer.allocUnsafe(CHUNK_SIZE);

		for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
			const bytesRead = fs.readSync(
				fileHandle,
				buffer,
				0,
				CHUNK_SIZE,
				chunkIndex * CHUNK_SIZE,
			);
			const chunkData = buffer.slice(0, bytesRead);

			const FormData = require("form-data");
			const formData = new FormData();
			formData.append("sessionId", sessionId);
			formData.append("chunkIndex", chunkIndex.toString());
			formData.append("chunk", chunkData, { filename: `chunk_${chunkIndex}` });

			const chunkResponse = await fetch(
				`${serverHost}/api/backup/upload/chunk`,
				{
					method: "POST",
					headers: {
						"X-API-Key": apiKey,
						...formData.getHeaders(),
					},
					body: formData,
				},
			);

			if (!chunkResponse.ok) {
				fs.closeSync(fileHandle);
				throw new Error(
					`Failed to upload chunk ${chunkIndex}: ${await chunkResponse.text()}`,
				);
			}

			const progress = ((chunkIndex + 1) / totalChunks) * 90; // Reserve 10% for completion
			sendProgress(`Uploading ${fileName}: ${Math.round(progress)}%`, progress);
		}

		fs.closeSync(fileHandle);

		// Step 3: Complete upload
		sendProgress(`Finalizing ${fileName}...`, 95);
		const completeResponse = await fetch(
			`${serverHost}/api/backup/upload/complete`,
			{
				method: "POST",
				headers: {
					"X-API-Key": apiKey,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ sessionId }),
			},
		);

		if (!completeResponse.ok) {
			throw new Error(
				`Failed to complete upload: ${await completeResponse.text()}`,
			);
		}

		sendProgress(`${fileName} uploaded successfully`, 100);
		return { success: true, version };
	} catch (error) {
		console.error(`Error uploading ${fileName}:`, error);
		throw error;
	}
}

// Internal backup function that can be called by both IPC and scheduler
async function performBackupInternal(params) {
	const { serverHost, apiKey, backupName, files } = params;

	try {
		const fetch = require("node-fetch");

		// Determine if we should use chunked upload (for files > 100MB) or traditional upload
		const CHUNKED_THRESHOLD = 100 * 1024 * 1024; // 100MB
		let shouldUseChunked = false;
		let version = null;

		// Helper to send progress updates
		const sendProgress = (message, percent) => {
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send("backup-progress", {
					message,
					percent,
				});
			}
		};

		// First, check if any file is large enough to warrant chunked upload
		const checkFileSize = (filePath) => {
			const stats = fs.statSync(filePath);
			if (stats.isFile() && stats.size > CHUNKED_THRESHOLD) {
				shouldUseChunked = true;
				return true;
			} else if (stats.isDirectory()) {
				const items = fs.readdirSync(filePath);
				for (const item of items) {
					if (checkFileSize(path.join(filePath, item))) {
						return true;
					}
				}
			}
			return false;
		};

		for (const filePath of files) {
			if (checkFileSize(filePath)) {
				break;
			}
		}

		// Use chunked upload for large files
		if (shouldUseChunked) {
			sendProgress("Processing files for chunked upload...", 0);

			let processedFiles = 0;
			let totalFiles = 0;

			// Count total files
			const countFiles = (filePath) => {
				const stats = fs.statSync(filePath);
				if (stats.isFile()) {
					totalFiles++;
				} else if (stats.isDirectory()) {
					const items = fs.readdirSync(filePath);
					for (const item of items) {
						countFiles(path.join(filePath, item));
					}
				}
			};

			for (const filePath of files) {
				countFiles(filePath);
			}

			// Upload each file using chunked upload
			const uploadFile = async (filePath) => {
				const stats = fs.statSync(filePath);
				if (stats.isFile()) {
					const fileName = path.basename(filePath);
					const result = await uploadFileInChunks(
						serverHost,
						apiKey,
						backupName,
						filePath,
						fileName,
						(msg, pct) => {
							const overallProgress =
								(processedFiles / totalFiles) * 100 + pct / totalFiles;
							sendProgress(msg, overallProgress);
						},
					);
					if (!version) version = result.version;
					processedFiles++;
				} else if (stats.isDirectory()) {
					const addDirectory = async (dirPath, baseDir) => {
						const items = fs.readdirSync(dirPath);
						for (const item of items) {
							const fullPath = path.join(dirPath, item);
							const itemStats = fs.statSync(fullPath);
							if (itemStats.isFile()) {
								const relativePath = path.relative(baseDir, fullPath);
								const result = await uploadFileInChunks(
									serverHost,
									apiKey,
									backupName,
									fullPath,
									relativePath,
									(msg, pct) => {
										const overallProgress =
											(processedFiles / totalFiles) * 100 + pct / totalFiles;
										sendProgress(msg, overallProgress);
									},
								);
								if (!version) version = result.version;
								processedFiles++;
							} else if (itemStats.isDirectory()) {
								await addDirectory(fullPath, baseDir);
							}
						}
					};
					await addDirectory(filePath, path.dirname(filePath));
				}
			};

			for (const filePath of files) {
				await uploadFile(filePath);
			}

			// Finalize the backup
			sendProgress("Finalizing backup...", 95);
			const finalizeResponse = await fetch(
				`${serverHost}/api/backup/finalize`,
				{
					method: "POST",
					headers: {
						"X-API-Key": apiKey,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ backupName, version }),
				},
			);

			if (!finalizeResponse.ok) {
				throw new Error(`Failed to finalize: ${await finalizeResponse.text()}`);
			}

			const result = await finalizeResponse.json();
			sendProgress("Backup completed!", 100);

			// Store backup history
			const history = store.get("backupHistory", []);
			history.unshift({
				backupName: result.backupName,
				version: result.version,
				timestamp: result.timestamp,
				filesCount: result.filesCount,
				totalSize: result.totalSize,
				status: "completed",
			});

			if (history.length > 50) {
				history.length = 50;
			}

			store.set("backupHistory", history);

			return result;
		} else {
			// Traditional upload for smaller files
			const FormData = require("form-data");
			const formData = new FormData();

			formData.append("backupName", backupName);
			formData.append(
				"metadata",
				JSON.stringify({
					platform: process.platform,
					timestamp: new Date().toISOString(),
				}),
			);

			// Add files to form data with streaming for large files
			let fileIndex = 0;
			let totalFiles = 0;
			let processedFiles = 0;

			// First, count total files
			const countFiles = (filePath) => {
				const stats = fs.statSync(filePath);
				if (stats.isFile()) {
					totalFiles++;
				} else if (stats.isDirectory()) {
					const items = fs.readdirSync(filePath);
					for (const item of items) {
						countFiles(path.join(filePath, item));
					}
				}
			};

			for (const filePath of files) {
				countFiles(filePath);
			}

			sendProgress(`Preparing ${totalFiles} files...`, 0);

			// Process files with streaming for large files
			for (const filePath of files) {
				const stats = fs.statSync(filePath);
				if (stats.isFile()) {
					const fileName = path.basename(filePath);
					const fileSize = stats.size;

					// For files larger than 10MB, use streaming
					if (fileSize > 10 * 1024 * 1024) {
						sendProgress(
							`Processing large file: ${fileName}`,
							(processedFiles / totalFiles) * 100,
						);
						const fileStream = fs.createReadStream(filePath);
						formData.append(`file_${fileIndex}`, fileStream, {
							filename: fileName,
							knownLength: fileSize,
						});
					} else {
						const fileBuffer = fs.readFileSync(filePath);
						formData.append(`file_${fileIndex}`, fileBuffer, fileName);
					}

					fileIndex++;
					processedFiles++;
					sendProgress(
						`Processing: ${fileName}`,
						(processedFiles / totalFiles) * 100,
					);
				} else if (stats.isDirectory()) {
					// Recursively add all files in directory
					const addDirectory = (dirPath, baseDir) => {
						const items = fs.readdirSync(dirPath);
						for (const item of items) {
							const fullPath = path.join(dirPath, item);
							const itemStats = fs.statSync(fullPath);
							if (itemStats.isFile()) {
								const relativePath = path.relative(baseDir, fullPath);
								const fileSize = itemStats.size;

								// For files larger than 10MB, use streaming
								if (fileSize > 10 * 1024 * 1024) {
									sendProgress(
										`Processing large file: ${relativePath}`,
										(processedFiles / totalFiles) * 100,
									);
									const fileStream = fs.createReadStream(fullPath);
									formData.append(`file_${fileIndex}`, fileStream, {
										filename: relativePath,
										knownLength: fileSize,
									});
								} else {
									const fileBuffer = fs.readFileSync(fullPath);
									formData.append(
										`file_${fileIndex}`,
										fileBuffer,
										relativePath,
									);
								}

								fileIndex++;
								processedFiles++;
								sendProgress(
									`Processing: ${relativePath}`,
									(processedFiles / totalFiles) * 100,
								);
							} else if (itemStats.isDirectory()) {
								addDirectory(fullPath, baseDir);
							}
						}
					};
					addDirectory(filePath, path.dirname(filePath));
				}
			}

			sendProgress("Uploading to server...", 95);

			// Send backup to server with better error handling
			try {
				const response = await fetch(`${serverHost}/api/backup/upload`, {
					method: "POST",
					headers: {
						"X-API-Key": apiKey,
						...formData.getHeaders(),
					},
					body: formData,
				});

				if (!response.ok) {
					const errorText = await response.text();
					throw new Error(
						`Server responded with ${response.status}: ${errorText}`,
					);
				}

				const result = await response.json();

				if (result.success) {
					sendProgress("Backup completed!", 100);

					// Store backup history
					const history = store.get("backupHistory", []);
					history.unshift({
						backupName: result.backupName,
						version: result.version,
						timestamp: result.timestamp,
						filesCount: result.filesCount,
						totalSize: result.totalSize,
						status: "completed",
					});

					// Keep only last 50 backups in history
					if (history.length > 50) {
						history.length = 50;
					}

					store.set("backupHistory", history);
				}

				return result;
			} catch (uploadError) {
				console.error("Upload error:", uploadError);

				// Provide more specific error messages
				let errorMessage = uploadError.message;
				if (uploadError.code === "EPIPE") {
					errorMessage =
						"Server connection lost during upload. The file might be too large or the server is not responding.";
				} else if (uploadError.code === "ECONNREFUSED") {
					errorMessage =
						"Cannot connect to server. Make sure the server is running.";
				} else if (uploadError.type === "request-timeout") {
					errorMessage = "Upload timed out. The file might be too large.";
				}

				throw new Error(errorMessage);
			}
		}
	} catch (error) {
		console.error("Backup error:", error);
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("backup-progress", {
				message: `Error: ${error.message}`,
				percent: 0,
				error: true,
			});
		}
		return { success: false, error: error.message };
	}
}

// Perform backup with progress tracking and chunked upload for large files
ipcMain.handle("perform-backup", async (_event, params) => {
	return performBackupInternal(params);
});

// Get backup history
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
	store.set("manualUpdateCheck", true);
	try {
		const result = await autoUpdater.checkForUpdates();
		return { success: true, updateInfo: result?.updateInfo };
	} catch (error) {
		console.error("Check for updates error:", error);
		return { success: false, error: error.message };
	}
});

ipcMain.handle("get-app-version", () => {
	return app.getVersion();
});

// Internal Firebird backup function
async function performFirebirdBackupInternal(params) {
	const { serverHost, apiKey, backupName, dbPath, gbakPath } = params;
	const { exec } = require("node:child_process");
	const { promisify } = require("node:util");
	const execAsync = promisify(exec);
	const zlib = require("node:zlib");

	let tempBackupPath = null;
	let tempCompressedPath = null;

	try {
		// Send initial progress
		const sendProgress = (message, percent) => {
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send("backup-progress", {
					message,
					percent,
				});
			}
		};

		sendProgress("Starting Firebird backup...", 0);

		// Create temporary directory for backup files
		const os = require("node:os");
		const crypto = require("node:crypto");
		const tempDir = os.tmpdir();
		const timestamp = Date.now();
		const randomId = crypto.randomBytes(8).toString("hex");
		const dbFileName = path.basename(dbPath, path.extname(dbPath));

		tempBackupPath = path.join(
			tempDir,
			`${dbFileName}_${timestamp}_${randomId}.fbk`,
		);
		tempCompressedPath = path.join(
			tempDir,
			`${dbFileName}_${timestamp}_${randomId}.fbk.gz`,
		);

		// Determine gbak executable path
		let gbakCommand = gbakPath || "gbak";

		// Check if gbak is accessible
		try {
			await execAsync(`"${gbakCommand}" -?`);
		} catch (_error) {
			// Try common installation paths
			const commonPaths = [
				"C:\\Program Files\\Firebird\\Firebird_3_0\\gbak.exe",
				"C:\\Program Files\\Firebird\\Firebird_4_0\\gbak.exe",
				"C:\\Program Files (x86)\\Firebird\\Firebird_3_0\\gbak.exe",
				"/usr/bin/gbak",
				"/opt/firebird/bin/gbak",
			];

			let found = false;
			for (const testPath of commonPaths) {
				if (fs.existsSync(testPath)) {
					gbakCommand = testPath;
					found = true;
					break;
				}
			}

			if (!found) {
				throw new Error(
					"gbak executable not found. Please specify the path to gbak in settings.",
				);
			}
		}

		sendProgress("Creating Firebird backup with gbak...", 10);

		// Execute gbak backup command
		// Format: gbak -b -user SYSDBA -password masterkey database.fdb backup.fbk
		const gbakCmd = `"${gbakCommand}" -b -v -user SYSDBA -password masterkey "${dbPath}" "${tempBackupPath}"`;

		console.log("Executing gbak command:", gbakCmd);

		try {
			const { stdout, stderr } = await execAsync(gbakCmd);
			console.log("gbak stdout:", stdout);
			if (stderr) console.log("gbak stderr:", stderr);
		} catch (error) {
			console.error("gbak error:", error);
			throw new Error(`Firebird backup failed: ${error.message}`);
		}

		// Verify backup file was created
		if (!fs.existsSync(tempBackupPath)) {
			throw new Error("Firebird backup file was not created");
		}

		const backupStats = fs.statSync(tempBackupPath);
		sendProgress(
			`Compressing backup (${(backupStats.size / 1024 / 1024).toFixed(2)} MB)...`,
			40,
		);

		// Compress the backup file
		await new Promise((resolve, reject) => {
			const input = fs.createReadStream(tempBackupPath);
			const output = fs.createWriteStream(tempCompressedPath);
			const gzip = zlib.createGzip({ level: 9 });

			input.pipe(gzip).pipe(output).on("finish", resolve).on("error", reject);
		});

		const compressedStats = fs.statSync(tempCompressedPath);
		sendProgress(
			`Uploading compressed backup (${(compressedStats.size / 1024 / 1024).toFixed(2)} MB)...`,
			60,
		);

		// Upload the compressed backup
		const FormData = require("form-data");
		const formData = new FormData();

		formData.append("backupName", backupName);
		formData.append(
			"metadata",
			JSON.stringify({
				platform: process.platform,
				timestamp: new Date().toISOString(),
				backupType: "firebird",
				originalSize: backupStats.size,
				compressedSize: compressedStats.size,
				databasePath: dbPath,
			}),
		);

		const fileStream = fs.createReadStream(tempCompressedPath);
		formData.append("file_0", fileStream, `${dbFileName}_${timestamp}.fbk.gz`);

		const fetch = require("node-fetch");
		const response = await fetch(`${serverHost}/api/backup/upload`, {
			method: "POST",
			headers: {
				"X-API-Key": apiKey,
				...formData.getHeaders(),
			},
			body: formData,
		});

		const result = await response.json();

		if (result.success) {
			sendProgress("Backup completed successfully!", 100);

			// Store backup history
			const history = store.get("backupHistory", []);
			history.unshift({
				backupName: result.backupName,
				version: result.version,
				timestamp: result.timestamp,
				filesCount: result.filesCount,
				totalSize: result.totalSize,
				status: "completed",
				backupType: "firebird",
			});

			if (history.length > 50) {
				history.length = 50;
			}

			store.set("backupHistory", history);
		}

		return result;
	} catch (error) {
		console.error("Firebird backup error:", error);
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("backup-progress", {
				message: `Error: ${error.message}`,
				percent: 0,
				error: true,
			});
		}
		return { success: false, error: error.message };
	} finally {
		// Clean up temporary files
		try {
			if (tempBackupPath && fs.existsSync(tempBackupPath)) {
				fs.unlinkSync(tempBackupPath);
				console.log("Deleted temporary backup file:", tempBackupPath);
			}
			if (tempCompressedPath && fs.existsSync(tempCompressedPath)) {
				fs.unlinkSync(tempCompressedPath);
				console.log("Deleted temporary compressed file:", tempCompressedPath);
			}
		} catch (_cleanupError) {
			console.error("Error cleaning up temporary files:", _cleanupError);
		}
	}
}

// Perform Firebird database backup
ipcMain.handle("perform-firebird-backup", async (_event, params) => {
	return performFirebirdBackupInternal(params);
});

app.whenReady().then(() => {
	createWindow();
	createTray();

	// Initialize the backup scheduler after app is ready
	initializeScheduler();

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

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("window-all-closed", () => {
	// Keep app running in background on all platforms
	// Don't quit when all windows are closed
});

app.on("before-quit", () => {
	app.isQuitting = true;

	// Clear all scheduled backups when quitting
	clearAllScheduledBackups();
});
