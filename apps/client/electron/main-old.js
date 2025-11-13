const { app, BrowserWindow } = require("electron");
const Store = require("electron-store");
const AutoLaunch = require("auto-launch");

// Import modules
const { createWindow, createTray } = require("./window-manager");
const { setupIpcHandlers } = require("./ipc-handlers");
const { configureAutoUpdater, setupAutoUpdaterHandlers, checkForUpdatesOnStartup } = require("./auto-updater");
const { initializeScheduler, clearAllScheduledBackups } = require("./scheduler");

const store = new Store();
let mainWindow = null;
let tray = null;

// Configure auto-launch for system startup
const autoLauncher = new AutoLaunch({
	name: "Backupr",
	path: app.getPath("exe"),
});

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
		// Check if we should start in background
		// This is set from Settings UI or on first startup
		const startInBackground = store.get("startInBackground", false);

		if (!startInBackground) {
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

// Backup state management
let backupState = {
	isRunning: false,
	isPaused: false,
	canPause: false,
};

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

// Initialize auto-launch based on user settings
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
			// Check for pause state before each chunk
			while (backupState.isPaused && backupState.isRunning) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}

			// If backup was stopped while paused, exit
			if (!backupState.isRunning) {
				fs.closeSync(fileHandle);
				throw new Error("Backup was cancelled");
			}

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

		// Set backup as running
		backupState.isRunning = true;
		backupState.isPaused = false;
		backupState.canPause = true;

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
					paused: backupState.isPaused,
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
					// Get proper filename resolving Windows short names and normalize
					const getProperFileName = (fPath) => {
						try {
							const realPath = fs.realpathSync(fPath);
							return path.basename(realPath);
						} catch (_error) {
							return path.basename(fPath);
						}
					};
					const fileName = getProperFileName(filePath).replace(/\\/g, "/");
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
								// Get proper relative path resolving Windows short names
								const getProperRelativePath = (base, full) => {
									try {
										const realBasePath = fs.realpathSync(base);
										const realFullPath = fs.realpathSync(full);
										return path.relative(realBasePath, realFullPath);
									} catch (_error) {
										return path.relative(base, full);
									}
								};
								const relativePath = getProperRelativePath(
									baseDir,
									fullPath,
								).replace(/\\/g, "/");
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
			// Traditional upload for smaller files - compress into ZIP first
			const archiver = require("archiver");
			const os = require("node:os");
			const crypto = require("node:crypto");

			const tempDir = os.tmpdir();
			const timestamp = Date.now();
			const randomId = crypto.randomBytes(8).toString("hex");
			const tempZipPath = path.join(
				tempDir,
				`backup_${backupName.replace(/[\\/:*?"<>|]/g, "_")}_${timestamp}_${randomId}.zip`,
			);

			let totalFiles = 0;

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

			sendProgress(`Compressing ${totalFiles} files into archive...`, 0);

			// Create ZIP archive
			let originalTotalSize = 0;
			await new Promise((resolve, reject) => {
				const output = fs.createWriteStream(tempZipPath);
				const archive = archiver("zip", {
					zlib: { level: 9 }, // Maximum compression
				});

				archive.on("progress", (progress) => {
					const compressionProgress = Math.min(
						(progress.entries.processed / totalFiles) * 80,
						80,
					);
					sendProgress(
						`Compressing: ${progress.entries.processed}/${totalFiles} files (${Math.round(compressionProgress)}%)`,
						compressionProgress,
					);
				});

				output.on("close", () => {
					originalTotalSize = archive.pointer();
					resolve();
				});
				archive.on("error", reject);
				output.on("error", reject);

				archive.pipe(output);

				// Add files to archive
				const addToArchive = async (filePath) => {
					// Check for pause state
					while (backupState.isPaused && backupState.isRunning) {
						await new Promise((resolve) => setTimeout(resolve, 1000));
					}

					if (!backupState.isRunning) {
						archive.abort();
						reject(new Error("Backup was cancelled"));
						return;
					}

					const stats = fs.statSync(filePath);
					if (stats.isFile()) {
						// Get proper filename resolving Windows short names and normalize
						const getProperFileName = (fPath) => {
							try {
								const realPath = fs.realpathSync(fPath);
								return path.basename(realPath);
							} catch (_error) {
								return path.basename(fPath);
							}
						};
						const fileName = getProperFileName(filePath).replace(/\\/g, "/");
						archive.file(filePath, { name: fileName });
					} else if (stats.isDirectory()) {
						// Get proper directory name
						const getProperDirName = (fPath) => {
							try {
								const realPath = fs.realpathSync(fPath);
								return path.basename(realPath);
							} catch (_error) {
								return path.basename(fPath);
							}
						};
						const dirName = getProperDirName(filePath);
						// Add directory recursively
						archive.directory(filePath, dirName);
					}
				};

				// Add all files/directories to archive
				Promise.all(files.map((filePath) => addToArchive(filePath)))
					.then(() => {
						archive.finalize();
					})
					.catch(reject);
			});

			// Check for pause state
			while (backupState.isPaused && backupState.isRunning) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}

			if (!backupState.isRunning) {
				// Clean up temporary ZIP
				if (fs.existsSync(tempZipPath)) {
					fs.unlinkSync(tempZipPath);
				}
				throw new Error("Backup was cancelled");
			}

			const zipStats = fs.statSync(tempZipPath);
			sendProgress(
				`Uploading compressed archive (${(zipStats.size / 1024 / 1024).toFixed(2)} MB)...`,
				85,
			);

			// Upload the ZIP file
			const FormData = require("form-data");
			const formData = new FormData();

			formData.append("backupName", backupName);
			formData.append(
				"metadata",
				JSON.stringify({
					platform: process.platform,
					timestamp: new Date().toISOString(),
					compressed: true,
					originalSize: originalTotalSize,
					compressedSize: zipStats.size,
					filesCount: totalFiles,
				}),
			);

			const fileStream = fs.createReadStream(tempZipPath);
			const normalizedFileName =
				`${backupName.replace(/[\\/:*?"<>|]/g, "_")}_${timestamp}.zip`.replace(
					/\\/g,
					"/",
				);
			formData.append("file_0", fileStream, {
				filename: normalizedFileName,
				knownLength: zipStats.size,
			});

			sendProgress("Uploading to server...", 90);

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

				// Clean up temporary ZIP file after successful upload
				try {
					if (fs.existsSync(tempZipPath)) {
						fs.unlinkSync(tempZipPath);
						console.log("Deleted temporary ZIP file:", tempZipPath);
					}
				} catch (cleanupError) {
					console.error("Error deleting temporary ZIP file:", cleanupError);
				}

				return result;
			} catch (uploadError) {
				console.error("Upload error:", uploadError);

				// Clean up temporary ZIP file on error
				try {
					if (fs.existsSync(tempZipPath)) {
						fs.unlinkSync(tempZipPath);
						console.log("Deleted temporary ZIP file after error:", tempZipPath);
					}
				} catch (cleanupError) {
					console.error("Error deleting temporary ZIP file:", cleanupError);
				}

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
	} finally {
		// Reset backup state
		backupState.isRunning = false;
		backupState.isPaused = false;
		backupState.canPause = false;
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

// Internal Firebird backup function using nbackup
async function performFirebirdBackupInternal(params) {
	const { serverHost, apiKey, backupName, dbPath, gbakPath } = params;
	const { exec } = require("node:child_process");
	const { promisify } = require("node:util");
	const execAsync = promisify(exec);
	const archiver = require("archiver");

	let tempBackupPath = null;
	let tempCompressedPath = null;
	let nbackupLocked = false;

	try {
		// Set backup as running
		backupState.isRunning = true;
		backupState.isPaused = false;
		backupState.canPause = true;

		// Send initial progress
		const sendProgress = (message, percent) => {
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send("backup-progress", {
					message,
					percent,
					paused: backupState.isPaused,
				});
			}
		};

		sendProgress("Starting Firebird backup with nbackup...", 0);

		// Create temporary directory for backup files
		const os = require("node:os");
		const crypto = require("node:crypto");
		const tempDir = os.tmpdir();
		const timestamp = Date.now();
		const randomId = crypto.randomBytes(8).toString("hex");

		// Extract database filename - handle Windows short names by using the original path
		const getProperFileName = (filePath) => {
			try {
				const realPath = fs.realpathSync(filePath);
				return path.basename(realPath, path.extname(realPath));
			} catch (_error) {
				return path.basename(filePath, path.extname(filePath));
			}
		};

		const dbFileName = getProperFileName(dbPath).replace(/[\\/:*?"<>|]/g, "_");

		tempBackupPath = path.join(
			tempDir,
			`${dbFileName}_${timestamp}_${randomId}.fdb`,
		);
		tempCompressedPath = path.join(
			tempDir,
			`${dbFileName}_${timestamp}_${randomId}.zip`,
		);

		// Determine nbackup executable path (usually in same directory as gbak)
		let nbackupCommand = "nbackup";

		if (gbakPath) {
			// If gbak path is specified, look for nbackup in same directory
			const gbakDir = path.dirname(gbakPath);
			const nbackupPath = path.join(
				gbakDir,
				process.platform === "win32" ? "nbackup.exe" : "nbackup",
			);
			if (fs.existsSync(nbackupPath)) {
				nbackupCommand = nbackupPath;
			}
		} else {
			// Try common installation paths
			const commonPaths = [
				"C:\\Program Files\\Firebird\\Firebird_3_0\\nbackup.exe",
				"C:\\Program Files\\Firebird\\Firebird_4_0\\nbackup.exe",
				"C:\\Program Files\\Firebird\\Firebird_5_0\\nbackup.exe",
				"C:\\Program Files (x86)\\Firebird\\Firebird_3_0\\nbackup.exe",
				"/usr/bin/nbackup",
				"/opt/firebird/bin/nbackup",
			];

			for (const testPath of commonPaths) {
				if (fs.existsSync(testPath)) {
					nbackupCommand = testPath;
					break;
				}
			}
		}

		// Check if nbackup is accessible
		try {
			await execAsync(`"${nbackupCommand}" -?`);
		} catch (_error) {
			throw new Error(
				"nbackup executable not found. Please install Firebird tools or specify the correct path.",
			);
		}

		// Check for pause state
		while (backupState.isPaused && backupState.isRunning) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		if (!backupState.isRunning) {
			throw new Error("Backup was cancelled");
		}

		sendProgress("Locking database for backup (nbackup -LOCK)...", 10);

		// Step 1: Lock the database
		const nbackupLockCmd = `"${nbackupCommand}" -LOCK "${dbPath}"`;

		console.log("Executing nbackup lock command:", nbackupLockCmd);

		try {
			const { stdout, stderr } = await execAsync(nbackupLockCmd);
			console.log("nbackup lock stdout:", stdout);
			if (stderr) console.log("nbackup lock stderr:", stderr);
			nbackupLocked = true;
		} catch (error) {
			console.error("nbackup lock error:", error);
			throw new Error(`Failed to lock database: ${error.message}`);
		}

		// Check for pause state
		while (backupState.isPaused && backupState.isRunning) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		if (!backupState.isRunning) {
			throw new Error("Backup was cancelled");
		}

		sendProgress("Copying database file...", 30);

		// Step 2: Copy the database file
		const originalStats = fs.statSync(dbPath);
		await new Promise((resolve, reject) => {
			const readStream = fs.createReadStream(dbPath);
			const writeStream = fs.createWriteStream(tempBackupPath);

			let copiedBytes = 0;
			const totalBytes = originalStats.size;

			readStream.on("data", (chunk) => {
				copiedBytes += chunk.length;
				const copyProgress = Math.min(30 + (copiedBytes / totalBytes) * 30, 60);
				sendProgress(
					`Copying database file: ${Math.round(copyProgress - 30)}%`,
					copyProgress,
				);
			});

			readStream.pipe(writeStream);
			writeStream.on("finish", resolve);
			writeStream.on("error", reject);
			readStream.on("error", reject);
		});

		// Check for pause state
		while (backupState.isPaused && backupState.isRunning) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		if (!backupState.isRunning) {
			throw new Error("Backup was cancelled");
		}

		sendProgress("Unlocking database (nbackup -UNLOCK)...", 60);

		// Step 3: Unlock the database
		const nbackupUnlockCmd = `"${nbackupCommand}" -UNLOCK "${dbPath}"`;

		console.log("Executing nbackup unlock command:", nbackupUnlockCmd);

		try {
			const { stdout, stderr } = await execAsync(nbackupUnlockCmd);
			console.log("nbackup unlock stdout:", stdout);
			if (stderr) console.log("nbackup unlock stderr:", stderr);
			nbackupLocked = false; // Successfully unlocked
		} catch (error) {
			console.error("nbackup unlock error:", error);
			throw new Error(`Failed to unlock database: ${error.message}`);
		}

		// Check for pause state
		while (backupState.isPaused && backupState.isRunning) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		if (!backupState.isRunning) {
			throw new Error("Backup was cancelled");
		}

		sendProgress("Fixing up backup copy (nbackup -FIXUP)...", 65);

		// Step 4: Fix up the copied database
		const nbackupFixupCmd = `"${nbackupCommand}" -FIXUP "${tempBackupPath}"`;

		console.log("Executing nbackup fixup command:", nbackupFixupCmd);

		try {
			const { stdout, stderr } = await execAsync(nbackupFixupCmd);
			console.log("nbackup fixup stdout:", stdout);
			if (stderr) console.log("nbackup fixup stderr:", stderr);
		} catch (error) {
			console.error("nbackup fixup error:", error);
			throw new Error(`Failed to fixup backup copy: ${error.message}`);
		}

		// Verify backup file was created and fixed up
		if (!fs.existsSync(tempBackupPath)) {
			throw new Error("Database backup file was not created");
		}

		const backupStats = fs.statSync(tempBackupPath);
		sendProgress(
			`Compressing backup (${(backupStats.size / 1024 / 1024).toFixed(2)} MB)...`,
			70,
		);

		// Compress the backup file with ZIP
		await new Promise((resolve, reject) => {
			const output = fs.createWriteStream(tempCompressedPath);
			const archive = archiver("zip", {
				zlib: { level: 9 }, // Maximum compression
			});

			let compressedBytes = 0;

			archive.on("progress", (progress) => {
				compressedBytes = progress.fs.processedBytes;
				const compressionProgress = Math.min(
					70 + (compressedBytes / backupStats.size) * 20,
					90,
				);
				sendProgress(
					`Compressing: ${Math.round(compressionProgress - 70)}%`,
					compressionProgress,
				);
			});

			output.on("close", resolve);
			archive.on("error", reject);

			archive.pipe(output);
			archive.file(tempBackupPath, { name: path.basename(tempBackupPath) });
			archive.finalize();
		});

		// Check for pause state
		while (backupState.isPaused && backupState.isRunning) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		if (!backupState.isRunning) {
			throw new Error("Backup was cancelled");
		}

		const compressedStats = fs.statSync(tempCompressedPath);
		sendProgress(
			`Uploading compressed backup (${(compressedStats.size / 1024 / 1024).toFixed(2)} MB)...`,
			90,
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
		// Ensure filename uses forward slashes and no backslashes for cross-platform compatibility
		const normalizedFileName = `${dbFileName}_${timestamp}.fbk.zip`.replace(
			/\\/g,
			"/",
		);
		formData.append("file_0", fileStream, normalizedFileName);

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
		// Reset backup state
		backupState.isRunning = false;
		backupState.isPaused = false;
		backupState.canPause = false;

		// If database is still locked, try to unlock it
		if (nbackupLocked) {
			try {
				const nbackupCommand = gbakPath
					? path.join(
							path.dirname(gbakPath),
							process.platform === "win32" ? "nbackup.exe" : "nbackup",
						)
					: "nbackup";
				const nbackupUnlockCmd = `"${nbackupCommand}" -UNLOCK "${dbPath}"`;
				await execAsync(nbackupUnlockCmd);
				console.log("Successfully unlocked database in cleanup");
			} catch (unlockError) {
				console.error("Failed to unlock database in cleanup:", unlockError);
			}
		}

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

// Pause backup operations
ipcMain.handle("pause-backup", async () => {
	backupState.isPaused = true;
	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.webContents.send("backup-progress", {
			message: "Backup paused by user",
			percent: 0,
			paused: true,
		});
	}
	return { success: true };
});

// Resume backup operations
ipcMain.handle("resume-backup", async () => {
	backupState.isPaused = false;
	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.webContents.send("backup-progress", {
			message: "Backup resumed",
			percent: 0,
			paused: false,
		});
	}
	return { success: true };
});

app.whenReady().then(() => {
	createWindow();
	createTray();

	// Initialize auto-launch based on saved settings
	initializeAutoLaunch();

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
