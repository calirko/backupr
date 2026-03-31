const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { URL } = require("node:url");
const { generateZip, deleteZipTemp } = require("./file");
const { notifyBackupSuccess, notifyBackupError } = require("./notification");

let mainWindow = null;

function setMainWindow(win) {
	mainWindow = win;
}

function sendBackupStatus(status) {
	if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
		mainWindow.webContents.send("backup-status", status);
	}
}

async function streamUploadFile({
	zipPath,
	backupName,
	serverHost,
	apiKey,
	onProgress,
}) {
	if (!fs.existsSync(zipPath)) {
		console.error(`Zip file not found: ${zipPath}`);
		return false;
	}

	const fileStats = fs.statSync(zipPath);
	const fileSize = fileStats.size;
	const fileName = path.basename(zipPath);

	return new Promise((resolve) => {
		try {
			const uploadUrl = new URL("/api/backup/upload", serverHost);
			const options = {
				hostname: uploadUrl.hostname,
				port: uploadUrl.port || (uploadUrl.protocol === "https:" ? 443 : 80),
				path: uploadUrl.pathname,
				method: "PUT",
				headers: {
					"X-API-Key": apiKey,
					"X-Backup-Name": backupName,
					"X-File-Name": fileName,
					"Content-Length": fileSize.toString(),
					"Content-Type": "application/octet-stream",
				},
			};

			const protocol =
				uploadUrl.protocol === "https:" ? https : require("node:http");

			let uploadedBytes = 0;
			let lastProgressUpdate = 0;
			const throttleMs = 500; // Update progress max once per 500ms
			let done = false;

			const req = protocol.request(options, (res) => {
				res.on("data", () => {
					// We don't need the response data, just consume it so the stream ends
				});

				res.on("end", () => {
					done = true;
					if (res.statusCode >= 200 && res.statusCode < 300) {
						if (onProgress) {
							onProgress(100); // Upload complete
						}
						try {
							resolve(true);
						} catch (_e) {
							console.error(
								`Failed to resolve upload promise for ${backupName}:`,
								_e,
							);
							resolve(true);
						}
					} else {
						console.error(
							`Failed to upload backup: ${res.statusCode} ${res.statusMessage}`,
						);
						resolve(false);
					}
				});
			});

			req.setTimeout(480000, () => {
				// 8 minute timeout for slow uploads
				if (done) return;
				done = true;
				console.error(`Upload timeout for ${backupName}`);
				req.destroy(new Error("Request timed out"));
			});

			req.on("error", (error) => {
				done = true;
				console.error(`Failed to upload backup for ${backupName}:`, error);
				resolve(false);
			});

			const fileStream = fs.createReadStream(zipPath);

			// Track upload progress
			fileStream.on("data", (chunk) => {
				if (done) return;
				uploadedBytes += chunk.length;
				const now = Date.now();
				if (now - lastProgressUpdate >= throttleMs && onProgress) {
					const progress = (uploadedBytes / fileSize) * 100;
					onProgress(Math.min(progress, 99)); // Cap at 99% until response
					lastProgressUpdate = now;
				}
			});

			fileStream.pipe(req);
		} catch (error) {
			console.error(`Failed to upload backup for ${backupName}:`, error);
			resolve(false);
		}
	});
}

async function runBackup(task, store, onStatus = null) {
	const backupStartTime = new Date();
	let zipPath;

	const serverHost = await store.get("serverHost");
	const apiKey = await store.get("apiKey");

	if (!serverHost || !apiKey) {
		console.error(
			`Missing server configuration for backup "${task.name}". Please set server host and API key in settings.`,
		);
		sendBackupStatus({
			title: "Backup failed",
			description: `Missing server configuration for "${task.name}". Please set server host and API key in settings.`,
			type: "error",
			progress: 0,
		});
		if (onStatus)
			onStatus({
				title: "Backup failed",
				description: `Missing server configuration for "${task.name}". Please set server host and API key in settings.`,
				type: "error",
				progress: 0,
			});
		return;
	}

	function _notify(status) {
		sendBackupStatus(status);
		if (onStatus) onStatus(status);
	}

	_notify({
		title: "Creating backup",
		description: `Preparing files for: ${task.name}`,
		type: "creating",
		progress: 0,
	});
	if (onStatus)
		onStatus({
			title: "Creating backup",
			description: `Preparing files for: ${task.name}`,
			type: "creating",
			progress: 0,
		});

	try {
		const zipResult = await generateZip({
			paths: task.paths,
			backupName: task.name,
			onProgress: (zipProgress) => {
				// Map zip progress 0-100% to overall progress 0-50%
				const progress = (zipProgress / 100) * 50;
				_notify({
					title: "Compressing files",
					description: `Preparing files for: ${task.name} (${Math.round(zipProgress)}%)`,
					type: "creating",
					progress: Math.round(progress),
				});
				if (onStatus)
					onStatus({
						title: "Compressing files",
						description: `Preparing files for: ${task.name} (${Math.round(zipProgress)}%)`,
						type: "creating",
						progress: Math.round(progress),
					});
			},
		});

		zipPath = zipResult;

		_notify({
			title: "Uploading backup",
			description: `Uploading: ${task.name}`,
			type: "uploading",
			progress: 50,
		});
		if (onStatus)
			onStatus({
				title: "Uploading backup",
				description: `Uploading: ${task.name}`,
				type: "uploading",
				progress: 50,
			});

		const uploadSuccess = await streamUploadFile({
			zipPath,
			backupName: task.name,
			serverHost,
			apiKey,
			onProgress: (uploadProgress) => {
				// Map upload progress 0-100% to overall progress 50-100%
				const progress = 50 + (uploadProgress / 100) * 50;
				_notify({
					title: "Uploading backup",
					description: `Uploading: ${task.name} (${Math.round(uploadProgress)}%)`,
					type: "uploading",
					progress: Math.round(progress),
				});
				if (onStatus)
					onStatus({
						title: "Uploading backup",
						description: `Uploading: ${task.name} (${Math.round(uploadProgress)}%)`,
						type: "uploading",
						progress: Math.round(progress),
					});
			},
		});

		if (uploadSuccess) {
			const tasks = store.get("tasks") || [];
			const updatedTasks = tasks.map((t) => {
				if (t.id === task.id) {
					return {
						...t,
						lastBackupDate: backupStartTime,
						lastBackupCompleted: new Date(),
					};
				}
				return t;
			});

			store.set("tasks", updatedTasks);

			_notify({
				title: "Backup completed",
				description: `Backup for "${task.name}" completed successfully`,
				type: "success",
				progress: 100,
			});
			if (onStatus)
				onStatus({
					title: "Backup completed",
					description: `Backup for "${task.name}" completed successfully`,
					type: "success",
					progress: 100,
				});

			// Send desktop notification even if window is closed
			notifyBackupSuccess(task.name);
		} else {
			if (onStatus)
				onStatus({
					title: "Backup failed",
					description: `Upload failed for "${task.name}". Please check your server connection and try again.`,
					type: "error",
					progress: 100,
				});
			throw new Error("Upload failed");
		}
	} catch (error) {
		console.error(`Backup failed for "${task.name}":`, error);

		const tasks = store.get("tasks") || [];
		const updatedTasks = tasks.map((t) => {
			if (t.id === task.id) {
				return {
					...t,
					lastBackupDate: backupStartTime,
					lastBackupCompleted: null,
				};
			}
			return t;
		});

		store.set("tasks", updatedTasks);

		_notify({
			title: "Backup failed",
			description: `Backup for "${task.name}" failed: ${error.message}`,
			type: "error",
			progress: 100,
		});

		// Send desktop notification even if window is closed
		notifyBackupError(task.name, error.message);

		// Re-throw so callers (e.g. ws-client) know the backup failed
		throw error;
	} finally {
		deleteZipTemp(zipPath);
	}
}

module.exports = {
	runBackup,
	setMainWindow,
	sendBackupStatus,
};
