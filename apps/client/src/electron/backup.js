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
	if (mainWindow?.webContents) {
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

	console.log(
		`Uploading backup: ${backupName} (${fileName}, ${fileSize} bytes)`,
	);

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

			const req = protocol.request(options, (res) => {
				let data = "";

				res.on("data", (chunk) => {
					data += chunk;
				});

				res.on("end", () => {
					if (res.statusCode >= 200 && res.statusCode < 300) {
						if (onProgress) {
							onProgress(100); // Upload complete
						}
						try {
							const result = JSON.parse(data);
							console.log(`Backup uploaded successfully:`, result);
							resolve(true);
						} catch (e) {
							console.log(`Backup uploaded successfully`);
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

			req.on("error", (error) => {
				console.error(`Failed to upload backup for ${backupName}:`, error);
				resolve(false);
			});

			const fileStream = fs.createReadStream(zipPath);

			// Track upload progress
			fileStream.on("data", (chunk) => {
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

async function runBackup(task, store) {
	const backupStartTime = new Date();
	let zipPath;

	console.log(
		`Starting backup: ${task.name} at ${backupStartTime.toISOString()}`,
	);

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
		return;
	}

	sendBackupStatus({
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
				sendBackupStatus({
					title: "Compressing files",
					description: `Preparing files for: ${task.name} (${Math.round(zipProgress)}%)`,
					type: "creating",
					progress: Math.round(progress),
				});
			},
		});

		zipPath = zipResult;

		sendBackupStatus({
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
				sendBackupStatus({
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

			sendBackupStatus({
				title: "Backup completed",
				description: `Backup for "${task.name}" completed successfully`,
				type: "success",
				progress: 100,
			});

			// Send desktop notification even if window is closed
			notifyBackupSuccess(task.name);

			console.log(`Backup completed successfully: ${task.name}`);
		} else {
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

		sendBackupStatus({
			title: "Backup failed",
			description: `Backup for "${task.name}" failed: ${error.message}`,
			type: "error",
			progress: 0,
		});

		// Send desktop notification even if window is closed
		notifyBackupError(task.name, error.message);
	} finally {
		deleteZipTemp(zipPath);
	}
}

module.exports = {
	runBackup,
	setMainWindow,
	sendBackupStatus,
};
