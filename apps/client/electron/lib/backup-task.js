/**
 * BackupTask - Represents a single backup operation with state tracking
 */

const EventEmitter = require("node:events");

class BackupTask extends EventEmitter {
	constructor(item, settings, store, mainWindow) {
		super();
		this.id = `task_${item.id}_${Date.now()}`;
		this.itemId = item.id;
		this.item = item;
		this.settings = settings;
		this.store = store;
		this.mainWindow = mainWindow;

		// Task state
		this.status = "pending"; // pending, running, paused, completed, failed, cancelled
		this.progress = 0;
		this.message = "";
		this.error = null;
		this.result = null;
		this.retryCount = 0;
		this.maxRetries = 3;

		// Timestamps
		this.createdAt = new Date();
		this.startedAt = null;
		this.completedAt = null;

		// Control flags
		this.isPaused = false;
		this.isCancelled = false;
		this.isRunning = false;
	}

	/**
	 * Execute the backup task
	 */
	async execute() {
		if (this.status !== "pending" && this.status !== "failed") {
			throw new Error(`Cannot execute task in ${this.status} state`);
		}

		this.status = "running";
		this.isRunning = true;
		this.startedAt = new Date();
		this.emit("statusChange", this.getState());

		try {
			// Import backup functions
			const {
				performBackupInternal,
				performFirebirdBackupInternal,
			} = require("../backup-manager");

			// Execute appropriate backup type
			if (this.item.backupType === "firebird") {
				this.result = await performFirebirdBackupInternal(
					{
						serverHost: this.settings.serverHost,
						apiKey: this.settings.apiKey,
						backupName: this.item.name,
						dbPath: this.item.firebirdDbPath,
						gbakPath: this.item.gbakPath || undefined,
					},
					this.store,
					this.mainWindow,
				);
			} else {
				this.result = await performBackupInternal(
					{
						serverHost: this.settings.serverHost,
						apiKey: this.settings.apiKey,
						backupName: this.item.name,
						files: this.item.paths,
					},
					this.store,
					this.mainWindow,
				);
			}

			// Check if task was cancelled during execution
			if (this.isCancelled) {
				this.status = "cancelled";
				this.emit("statusChange", this.getState());
				return this.result;
			}

			// Check result
			if (this.result && this.result.success) {
				this.status = "completed";
				this.progress = 100;
				this.completedAt = new Date();
				this.emit("completed", this.result);
			} else {
				throw new Error(this.result?.error || "Backup failed");
			}
		} catch (error) {
			this.error = error.message;

			// Check if we should retry
			if (this.retryCount < this.maxRetries && !this.isCancelled) {
				this.retryCount++;
				this.status = "failed";
				this.emit("retry", { attempt: this.retryCount, error: this.error });

				// Exponential backoff: 30s, 60s, 120s
				const delay = Math.min(30000 * Math.pow(2, this.retryCount - 1), 120000);
				await new Promise((resolve) => setTimeout(resolve, delay));

				// Retry if not cancelled
				if (!this.isCancelled) {
					this.status = "pending";
					return this.execute();
				}
			}

			this.status = "failed";
			this.completedAt = new Date();
			this.emit("failed", this.error);
		} finally {
			this.isRunning = false;
			this.emit("statusChange", this.getState());
		}

		return this.result;
	}

	/**
	 * Pause the task
	 */
	pause() {
		if (this.status === "running") {
			this.isPaused = true;
			this.status = "paused";
			this.emit("paused");
			this.emit("statusChange", this.getState());

			// Delegate to backup-manager's pause functionality
			const { pauseBackup } = require("../backup-manager");
			pauseBackup();
		}
	}

	/**
	 * Resume the task
	 */
	resume() {
		if (this.status === "paused") {
			this.isPaused = false;
			this.status = "running";
			this.emit("resumed");
			this.emit("statusChange", this.getState());

			// Delegate to backup-manager's resume functionality
			const { resumeBackup } = require("../backup-manager");
			resumeBackup();
		}
	}

	/**
	 * Cancel the task
	 */
	cancel() {
		this.isCancelled = true;
		if (this.status === "running" || this.status === "paused") {
			this.status = "cancelled";
			this.completedAt = new Date();
			this.emit("cancelled");
			this.emit("statusChange", this.getState());
		}
	}

	/**
	 * Get current task state
	 */
	getState() {
		return {
			id: this.id,
			itemId: this.itemId,
			itemName: this.item.name,
			status: this.status,
			progress: this.progress,
			message: this.message,
			error: this.error,
			retryCount: this.retryCount,
			maxRetries: this.maxRetries,
			createdAt: this.createdAt,
			startedAt: this.startedAt,
			completedAt: this.completedAt,
			isPaused: this.isPaused,
			isCancelled: this.isCancelled,
			isRunning: this.isRunning,
		};
	}
}

module.exports = { BackupTask };
