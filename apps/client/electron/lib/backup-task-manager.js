/**
 * BackupTaskManager - Manages multiple concurrent backup tasks
 */

const EventEmitter = require("node:events");
const { BackupTask } = require("./backup-task");

class BackupTaskManager extends EventEmitter {
	constructor() {
		super();

		// Task management
		this.tasks = new Map(); // taskId -> BackupTask
		this.runningTasks = new Set(); // Set of taskIds currently running
		this.itemTasks = new Map(); // itemId -> Set of taskIds

		// Configuration
		this.maxConcurrentTasks = 3; // Allow up to 3 concurrent backups
		this.globallyPaused = false;

		// Task queue
		this.taskQueue = [];
	}

	/**
	 * Create and enqueue a backup task
	 */
	async createTask(item, settings, store, mainWindow) {
		// Check if there's already a running task for this item
		const existingTasks = this.itemTasks.get(item.id) || new Set();
		const hasRunningTask = Array.from(existingTasks).some((taskId) => {
			const task = this.tasks.get(taskId);
			return task && (task.status === "running" || task.status === "pending");
		});

		if (hasRunningTask) {
			console.log(
				`[TaskManager] Backup already in progress for item "${item.name}", skipping`,
			);
			return null;
		}

		// Create new task
		const task = new BackupTask(item, settings, store, mainWindow);

		// Store task references
		this.tasks.set(task.id, task);
		if (!this.itemTasks.has(item.id)) {
			this.itemTasks.set(item.id, new Set());
		}
		this.itemTasks.get(item.id).add(task.id);

		// Set up task event listeners
		this.setupTaskListeners(task);

		// Emit task created event
		this.emit("taskCreated", task.getState());

		// Add to queue or execute immediately
		if (
			this.runningTasks.size < this.maxConcurrentTasks &&
			!this.globallyPaused
		) {
			this.executeTask(task);
		} else {
			this.taskQueue.push(task.id);
			console.log(
				`[TaskManager] Task ${task.id} queued (${this.taskQueue.length} in queue)`,
			);
			this.emit("taskQueued", task.getState());
		}

		return task;
	}

	/**
	 * Execute a task
	 */
	async executeTask(task) {
		if (this.globallyPaused) {
			console.log(
				`[TaskManager] Cannot execute task ${task.id}, globally paused`,
			);
			return;
		}

		this.runningTasks.add(task.id);
		console.log(
			`[TaskManager] Executing task ${task.id} for item "${task.item.name}"`,
		);

		try {
			await task.execute();
		} catch (error) {
			console.error(`[TaskManager] Task ${task.id} execution error:`, error);
		} finally {
			this.runningTasks.delete(task.id);
			this.processQueue();
		}
	}

	/**
	 * Process the task queue
	 */
	processQueue() {
		if (this.globallyPaused) {
			return;
		}

		while (
			this.taskQueue.length > 0 &&
			this.runningTasks.size < this.maxConcurrentTasks
		) {
			const taskId = this.taskQueue.shift();
			const task = this.tasks.get(taskId);

			if (task && task.status === "pending") {
				this.executeTask(task);
			}
		}
	}

	/**
	 * Set up event listeners for a task
	 */
	setupTaskListeners(task) {
		task.on("statusChange", (state) => {
			this.emit("taskStatusChange", state);
		});

		task.on("completed", (result) => {
			console.log(
				`[TaskManager] Task ${task.id} completed for "${task.item.name}"`,
			);
			this.emit("taskCompleted", { taskId: task.id, result });
			this.cleanupTask(task.id);
		});

		task.on("failed", (error) => {
			console.error(
				`[TaskManager] Task ${task.id} failed for "${task.item.name}":`,
				error,
			);
			this.emit("taskFailed", { taskId: task.id, error });
			this.cleanupTask(task.id);
		});

		task.on("cancelled", () => {
			console.log(`[TaskManager] Task ${task.id} cancelled`);
			this.emit("taskCancelled", { taskId: task.id });
			this.cleanupTask(task.id);
		});

		task.on("retry", ({ attempt, error }) => {
			console.log(
				`[TaskManager] Task ${task.id} retry attempt ${attempt}:`,
				error,
			);
			this.emit("taskRetry", { taskId: task.id, attempt, error });
		});

		task.on("paused", () => {
			this.emit("taskPaused", { taskId: task.id });
		});

		task.on("resumed", () => {
			this.emit("taskResumed", { taskId: task.id });
		});
	}

	/**
	 * Cleanup a task after completion/failure/cancellation
	 */
	cleanupTask(taskId, immediate = false) {
		const delay = immediate ? 0 : 60000; // Keep task info for 1 minute unless immediate

		setTimeout(() => {
			const task = this.tasks.get(taskId);
			if (task) {
				// Remove from item tasks
				const itemTaskSet = this.itemTasks.get(task.itemId);
				if (itemTaskSet) {
					itemTaskSet.delete(taskId);
					if (itemTaskSet.size === 0) {
						this.itemTasks.delete(task.itemId);
					}
				}

				// Remove task
				this.tasks.delete(taskId);
				console.log(`[TaskManager] Cleaned up task ${taskId}`);
			}
		}, delay);
	}

	/**
	 * Pause a specific task
	 */
	pauseTask(taskId) {
		const task = this.tasks.get(taskId);
		if (task) {
			task.pause();
		}
	}

	/**
	 * Resume a specific task
	 */
	resumeTask(taskId) {
		const task = this.tasks.get(taskId);
		if (task) {
			task.resume();
		}
	}

	/**
	 * Cancel a specific task
	 */
	cancelTask(taskId) {
		const task = this.tasks.get(taskId);
		if (task) {
			task.cancel();
			this.runningTasks.delete(taskId);
			this.taskQueue = this.taskQueue.filter((id) => id !== taskId);
			this.processQueue();
		}
	}

	/**
	 * Pause all tasks globally
	 */
	pauseAll() {
		this.globallyPaused = true;
		console.log("[TaskManager] All tasks paused globally");

		// Pause all running tasks
		for (const taskId of this.runningTasks) {
			this.pauseTask(taskId);
		}

		this.emit("globalPause", true);
	}

	/**
	 * Resume all tasks globally
	 */
	resumeAll() {
		this.globallyPaused = false;
		console.log("[TaskManager] All tasks resumed globally");

		// Resume all paused tasks
		for (const [taskId, task] of this.tasks) {
			if (task.status === "paused") {
				this.resumeTask(taskId);
			}
		}

		// Process queue
		this.processQueue();

		this.emit("globalPause", false);
	}

	/**
	 * Get all tasks for an item
	 */
	getTasksForItem(itemId) {
		const taskIds = this.itemTasks.get(itemId) || new Set();
		return Array.from(taskIds)
			.map((taskId) => this.tasks.get(taskId))
			.filter((task) => task !== undefined);
	}

	/**
	 * Get all active tasks (running or queued)
	 */
	getActiveTasks() {
		return Array.from(this.tasks.values())
			.filter(
				(task) =>
					task.status === "running" ||
					task.status === "pending" ||
					task.status === "paused",
			)
			.map((task) => task.getState());
	}

	/**
	 * Get task state
	 */
	getTaskState(taskId) {
		const task = this.tasks.get(taskId);
		return task ? task.getState() : null;
	}

	/**
	 * Get manager stats
	 */
	getStats() {
		return {
			totalTasks: this.tasks.size,
			runningTasks: this.runningTasks.size,
			queuedTasks: this.taskQueue.length,
			globallyPaused: this.globallyPaused,
			maxConcurrentTasks: this.maxConcurrentTasks,
		};
	}

	/**
	 * Cleanup all completed tasks immediately
	 */
	cleanupCompletedTasks() {
		for (const [taskId, task] of this.tasks) {
			if (
				task.status === "completed" ||
				task.status === "failed" ||
				task.status === "cancelled"
			) {
				this.cleanupTask(taskId, true);
			}
		}
	}

	/**
	 * Shutdown - cancel all tasks
	 */
	shutdown() {
		console.log("[TaskManager] Shutting down, cancelling all tasks");
		for (const taskId of this.tasks.keys()) {
			this.cancelTask(taskId);
		}
		this.tasks.clear();
		this.runningTasks.clear();
		this.itemTasks.clear();
		this.taskQueue = [];
	}
}

module.exports = { BackupTaskManager };
