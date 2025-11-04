const { app, BrowserWindow, Tray, Menu, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const Store = require("electron-store");

const store = new Store();
let mainWindow = null;
let tray = null;

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
	// Create a simple tray icon (we'll use a basic icon for now)
	tray = new Tray(path.join(__dirname, "../public/icon.png"));

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
			label: "Quit Backupr",
			click: () => {
				app.isQuitting = true;
				app.quit();
			},
		},
	]);

	tray.setToolTip("Backupr - File Backup");
	tray.setContextMenu(contextMenu);

	// Handle double-click to show/hide window
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

// IPC handlers for database operations and settings
ipcMain.handle("get-settings", async () => {
	return {
		serverHost: store.get("serverHost", ""),
		apiKey: store.get("apiKey", ""),
	};
});

ipcMain.handle("save-settings", async (event, settings) => {
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

ipcMain.handle("save-backup-config", async (event, config) => {
	store.set("backupConfig", config);
	return { success: true };
});

// Get all sync items
ipcMain.handle("get-sync-items", async () => {
	return store.get("syncItems", []);
});

// Save a sync item
ipcMain.handle("save-sync-item", async (event, item) => {
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
	return { success: true, item };
});

// Delete a sync item
ipcMain.handle("delete-sync-item", async (event, itemId) => {
	const items = store.get("syncItems", []);
	const filtered = items.filter((i) => i.id !== itemId);
	store.set("syncItems", filtered);
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

// Perform backup with progress tracking and chunked upload for large files
ipcMain.handle("perform-backup", async (event, params) => {
	const { serverHost, apiKey, backupName, files } = params;

	try {
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

		// Helper to send progress updates
		const sendProgress = (message, percent) => {
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send("backup-progress", {
					message,
					percent,
					processedFiles,
					totalFiles,
				});
			}
		};

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
								formData.append(`file_${fileIndex}`, fileBuffer, relativePath);
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

		// Send backup to server
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

// Perform Firebird database backup
ipcMain.handle("perform-firebird-backup", async (event, params) => {
	const { serverHost, apiKey, backupName, dbPath, gbakPath } = params;
	const { exec } = require("child_process");
	const { promisify } = require("util");
	const execAsync = promisify(exec);
	const zlib = require("zlib");
	const { pipeline } = require("stream");
	const { promisify: pipelineAsync } = require("util");
	const pipelinePromise = pipelineAsync(pipeline);

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
		const os = require("os");
		const crypto = require("crypto");
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
		} catch (error) {
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
		} catch (cleanupError) {
			console.error("Error cleaning up temporary files:", cleanupError);
		}
	}
});

app.whenReady().then(() => {
	createWindow();
	createTray();

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
});
