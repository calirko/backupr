const fs = require("node:fs");
const path = require("node:path");

/**
 * Backup state management
 */
const backupState = {
	isRunning: false,
	isPaused: false,
	canPause: false,
};

/**
 * Helper function for chunked file upload
 */
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

/**
 * Internal backup function that can be called by both IPC and scheduler
 */
async function performBackupInternal(params, store, mainWindow) {
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
		const sendProgress = (message, percent, stage = null) => {
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send("backup-progress", {
					message,
					percent,
					paused: backupState.isPaused,
					stage: stage || (percent < 80 ? "compressing" : "uploading"),
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
						(progress.entries.processed / totalFiles) * 70,
						70,
					);
					const compressionPercent = totalFiles > 0 
						? Math.round((progress.entries.processed / totalFiles) * 100)
						: 0;
					sendProgress(
						`Compressing: ${progress.entries.processed}/${totalFiles} files (${compressionPercent}%)`,
						compressionProgress,
						"compressing",
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
				`Uploading compressed archive via chunked upload (${(zipStats.size / 1024 / 1024).toFixed(2)} MB)...`,
				75,
			);

			// Upload the ZIP file using chunked upload
			try {
				const normalizedFileName =
					`${backupName.replace(/[\\/:*?"<>|]/g, "_")}_${timestamp}.zip`.replace(
						/\\/g,
						"/",
					);

				const result = await uploadFileInChunks(
					serverHost,
					apiKey,
					backupName,
					tempZipPath,
					normalizedFileName,
					(msg, pct) => {
						const uploadProgress = 75 + pct * 0.2; // Map 0-100% to 75-95%
						sendProgress(msg, uploadProgress);
					},
				);

				version = result.version;

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
						body: JSON.stringify({
							backupName,
							version,
							metadata: {
								platform: process.platform,
								timestamp: new Date().toISOString(),
								compressed: true,
								originalSize: originalTotalSize,
								compressedSize: zipStats.size,
								filesCount: totalFiles,
							},
						}),
					},
				);

				if (!finalizeResponse.ok) {
					throw new Error(
						`Failed to finalize: ${await finalizeResponse.text()}`,
					);
				}

				const finalResult = await finalizeResponse.json();
				sendProgress("Backup completed!", 100);

				// Store backup history
				const history = store.get("backupHistory", []);
				history.unshift({
					backupName: finalResult.backupName,
					version: finalResult.version,
					timestamp: finalResult.timestamp,
					filesCount: finalResult.filesCount,
					totalSize: finalResult.totalSize,
					status: "completed",
				});

				if (history.length > 50) {
					history.length = 50;
				}

				store.set("backupHistory", history);

				return finalResult;
			} finally {
				// Clean up temporary ZIP file
				try {
					if (fs.existsSync(tempZipPath)) {
						fs.unlinkSync(tempZipPath);
						console.log("Deleted temporary ZIP file:", tempZipPath);
					}
				} catch (cleanupError) {
					console.error("Error deleting temporary ZIP file:", cleanupError);
				}
			}
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
					const compressionPercent = totalFiles > 0 
						? Math.round((progress.entries.processed / totalFiles) * 100)
						: 0;
					sendProgress(
						`Compressing: ${progress.entries.processed}/${totalFiles} files (${compressionPercent}%)`,
						compressionProgress,
						"compressing",
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

/**
 * Internal Firebird backup function using nbackup
 */
async function performFirebirdBackupInternal(params, store, mainWindow) {
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
		const sendProgress = (message, percent, stage = null) => {
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send("backup-progress", {
					message,
					percent,
					paused: backupState.isPaused,
					stage: stage || (percent < 70 ? "preparing" : "uploading"),
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
		let nbackupFound = false;

		if (gbakPath) {
			// If gbak path is specified, look for nbackup in same directory
			const normalizedGbakPath = path.normalize(gbakPath);

			// Handle both cases: path to bin folder or path to gbak executable
			let searchDir = normalizedGbakPath;

			// If the path points to a file (gbak.exe), get its directory
			if (fs.existsSync(normalizedGbakPath)) {
				const stats = fs.statSync(normalizedGbakPath);
				if (stats.isFile()) {
					searchDir = path.dirname(normalizedGbakPath);
				}
			} else {
				// Path doesn't exist, assume it's meant to be a directory path (bin folder)
				searchDir = normalizedGbakPath;
			}

			const nbackupPath = path.join(
				searchDir,
				process.platform === "win32" ? "nbackup.exe" : "nbackup",
			);

			console.log("Looking for nbackup at:", nbackupPath);

			if (fs.existsSync(nbackupPath)) {
				nbackupCommand = nbackupPath;
				nbackupFound = true;
				console.log("Found nbackup at:", nbackupCommand);
			} else {
				console.log("nbackup not found at expected path:", nbackupPath);
			}
		}

		if (!nbackupFound) {
			// Try common installation paths
			const commonPaths = [
				"C:\\Program Files\\Firebird\\Firebird_2_5\\bin\\nbackup.exe",
				"C:\\Program Files\\Firebird\\Firebird_3_0\\bin\\nbackup.exe",
				"C:\\Program Files\\Firebird\\Firebird_4_0\\bin\\nbackup.exe",
				"C:\\Program Files\\Firebird\\Firebird_5_0\\bin\\nbackup.exe",
				"C:\\Program Files (x86)\\Firebird\\Firebird_2_5\\bin\\nbackup.exe",
				"C:\\Program Files (x86)\\Firebird\\Firebird_3_0\\bin\\nbackup.exe",
				"C:\\Program Files (x86)\\Firebird\\Firebird_4_0\\bin\\nbackup.exe",
				"C:\\Program Files (x86)\\Firebird\\Firebird_5_0\\bin\\nbackup.exe",
				"/usr/bin/nbackup",
				"/opt/firebird/bin/nbackup",
			];

			for (const testPath of commonPaths) {
				if (fs.existsSync(testPath)) {
					nbackupCommand = testPath;
					nbackupFound = true;
					console.log("Found nbackup at common path:", nbackupCommand);
					break;
				}
			}
		}

		// Check if nbackup is accessible
		try {
			const { stdout } = await execAsync(`"${nbackupCommand}" -?`).catch(
				(err) => {
					// nbackup returns exit code 1 for help, but still outputs help text
					if (err.stdout && err.stdout.includes("Physical Backup Manager")) {
						return { stdout: err.stdout, stderr: err.stderr };
					}
					throw err;
				},
			);

			if (
				stdout.includes("Physical Backup Manager") ||
				stdout.includes("nbackup")
			) {
				console.log("nbackup is accessible and responds to commands");
			} else {
				throw new Error("nbackup did not return expected output");
			}
		} catch (error) {
			console.error("nbackup test failed:", error);
			throw new Error(
				`nbackup executable not found or not accessible. Searched path: ${gbakPath ? path.join(path.normalize(gbakPath), process.platform === "win32" ? "nbackup.exe" : "nbackup") : "system PATH"}. Please verify that nbackup.exe exists in the same directory as gbak.exe.`,
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
		const nbackupLockCmd = `"${nbackupCommand}" -LOCK "${dbPath}" -U SYSDBA -P masterkey`;

		console.log("Executing nbackup lock command:", nbackupLockCmd);

		try {
			const { stdout, stderr } = await execAsync(nbackupLockCmd);
			console.log("nbackup lock stdout:", stdout);
			if (stderr) console.log("nbackup lock stderr:", stderr);
			nbackupLocked = true;
		} catch (error) {
			if (
				error.stderr.includes("Database is already in the physical backup mode")
			) {
				nbackupLocked = true;
			} else {
				console.error("nbackup lock error:", error);
				throw new Error(`Failed to lock database: ${error.message}`);
			}
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

		sendProgress("Unlocking database (nbackup -N)...", 60);

		// Step 3: Unlock the database
		const nbackupUnlockCmd = `"${nbackupCommand}" -N "${dbPath}" -U SYSDBA -P masterkey`;

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
		const nbackupFixupCmd = `"${nbackupCommand}" -FIXUP "${tempBackupPath}" -U SYSDBA -P masterkey`;

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
				const compressionPercent = Math.round((compressedBytes / backupStats.size) * 100);
				sendProgress(
					`Compressing database: ${compressionPercent}%`,
					compressionProgress,
					"compressing",
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
		const CHUNKED_THRESHOLD = 100 * 1024 * 1024; // 100MB
		const shouldUseChunked = compressedStats.size > CHUNKED_THRESHOLD;

		const fetch = require("node-fetch");

		// Use chunked upload for large files (same logic as normal backup)
		if (shouldUseChunked) {
			sendProgress(
				`Uploading compressed backup via chunked upload (${(compressedStats.size / 1024 / 1024).toFixed(2)} MB)...`,
				90,
			);

			// Upload using chunked upload
			try {
				const normalizedFileName = `${dbFileName}_${timestamp}.fbk.zip`.replace(
					/\\/g,
					"/",
				);

				const result = await uploadFileInChunks(
					serverHost,
					apiKey,
					backupName,
					tempCompressedPath,
					normalizedFileName,
					(msg, pct) => {
						const uploadProgress = 90 + pct * 0.05; // Map 0-100% to 90-95%
						sendProgress(msg, uploadProgress);
					},
				);

				const version = result.version;

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
						body: JSON.stringify({
							backupName,
							version,
							metadata: {
								platform: process.platform,
								timestamp: new Date().toISOString(),
								backupType: "firebird",
								originalSize: backupStats.size,
								compressedSize: compressedStats.size,
								databasePath: dbPath,
							},
						}),
					},
				);

				if (!finalizeResponse.ok) {
					throw new Error(
						`Failed to finalize: ${await finalizeResponse.text()}`,
					);
				}

				const finalResult = await finalizeResponse.json();
				sendProgress("Backup completed successfully!", 100);

				// Store backup history
				const history = store.get("backupHistory", []);
				history.unshift({
					backupName: finalResult.backupName,
					version: finalResult.version,
					timestamp: finalResult.timestamp,
					filesCount: finalResult.filesCount,
					totalSize: finalResult.totalSize,
					status: "completed",
					backupType: "firebird",
				});

				if (history.length > 50) {
					history.length = 50;
				}

				store.set("backupHistory", history);

				return finalResult;
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
		} else {
			// Traditional upload for smaller files (same logic as normal backup)
			sendProgress(
				`Uploading compressed backup (${(compressedStats.size / 1024 / 1024).toFixed(2)} MB)...`,
				90,
			);

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
			const normalizedFileName = `${dbFileName}_${timestamp}.fbk.zip`.replace(
				/\\/g,
				"/",
			);
			formData.append("file_0", fileStream, {
				filename: normalizedFileName,
				knownLength: compressedStats.size,
			});

			sendProgress("Uploading to server...", 92);

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
				const nbackupUnlockCmd = `"${nbackupCommand}" -N "${dbPath}" -U SYSDBA -P masterkey`;
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

/**
 * Pause backup operations
 */
function pauseBackup() {
	backupState.isPaused = true;
}

/**
 * Resume backup operations
 */
function resumeBackup() {
	backupState.isPaused = false;
}

/**
 * Get current backup state
 */
function getBackupState() {
	return { ...backupState };
}

module.exports = {
	performBackupInternal,
	performFirebirdBackupInternal,
	pauseBackup,
	resumeBackup,
	getBackupState,
};
