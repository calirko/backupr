const cron = require("node-cron");
const cronParser = require("cron-parser");
const { runBackup, setMainWindow, sendBackupStatus } = require("./backup");

const cronJobs = new Map();
const backupQueue = [];
const processingBackups = new Set();

let store = null;

function setStore(storeInstance) {
	store = storeInstance;
}

function setMainWindowReference(win) {
	setMainWindow(win);
}

/**
 * Calculate the next execution date for a cron expression and
 * persist it on the task in the store.
 */
function updateNextRunDate(taskId, cronExpression) {
	if (!store) {
		console.error("Store not initialized in updateNextRunDate");
		return;
	}

	console.log(
		`[updateNextRunDate] Calculating next date for task ${taskId} with cron: ${cronExpression}`,
	);

	try {
		// cron-parser v5+ uses parseExpression as a named export
		// cron-parser v4 and below uses cronParser.parseExpression
		let nextDate;

		if (typeof cronParser.parseExpression === "function") {
			// v4 and below
			const interval = cronParser.parseExpression(cronExpression);
			nextDate = interval.next().toISOString();
		} else if (typeof cronParser.CronExpressionParser !== "undefined") {
			// v5+
			const interval = cronParser.CronExpressionParser.parse(cronExpression);
			nextDate = interval.next().toISOString();
		} else {
			// Try as default export or direct function
			const interval = cronParser(cronExpression);
			nextDate = interval.next().toISOString();
		}

		const tasks = store.get("tasks") || [];
		const taskIndex = tasks.findIndex((t) => t.id === taskId);

		if (taskIndex !== -1) {
			tasks[taskIndex].next = nextDate;
			store.set("tasks", tasks);
			console.log(
				`[updateNextRunDate] Next run for "${tasks[taskIndex].name}": ${nextDate}`,
			);
		} else {
			console.error(`[updateNextRunDate] Task ${taskId} not found in store`);
		}
	} catch (error) {
		console.error(
			`[updateNextRunDate] Failed to calculate next run date for task ${taskId}:`,
			error.message,
		);
	}
}

/**
 * Clear the `next` value for a task (e.g. when it's stopped or deleted).
 */
function clearNextRunDate(taskId) {
	if (!store) return;

	const tasks = store.get("tasks") || [];
	const taskIndex = tasks.findIndex((t) => t.id === taskId);

	if (taskIndex !== -1 && tasks[taskIndex].next) {
		tasks[taskIndex].next = null;
		store.set("tasks", tasks);
	}
}

async function processBackupQueue() {
	if (backupQueue.length === 0 || processingBackups.size > 0) {
		return;
	}

	const task = backupQueue.shift();
	processingBackups.add(task.id);

	try {
		console.log(`Processing backup from queue: ${task.name}`);
		await runBackup(task, store);
	} catch (error) {
		console.error(`Error processing backup queue for ${task.name}:`, error);
	} finally {
		processingBackups.delete(task.id);
		console.log(
			`Finished backup: ${task.name}. Queue length: ${backupQueue.length}`,
		);

		// After a backup completes, recalculate the next run date
		console.log(`[processBackupQueue] Fetching updated task from store...`);
		const currentTasks = store.get("tasks") || [];
		const currentTask = currentTasks.find((t) => t.id === task.id);
		if (currentTask && currentTask.active && currentTask.schedule) {
			console.log(
				`[processBackupQueue] Updating next run date for: ${currentTask.name}`,
			);
			updateNextRunDate(currentTask.id, currentTask.schedule);
		} else {
			console.warn(
				`[processBackupQueue] Task not found or not active, skipping next date update:`,
				{
					taskId: task.id,
					checkActive: currentTask?.active,
					checkSchedule: currentTask?.schedule,
				},
			);
		}

		processBackupQueue();
	}
}

function queueBackup(task) {
	if (processingBackups.has(task.id)) {
		console.log(`Backup already in progress for task: ${task.name}`);
		return;
	}

	if (backupQueue.some((t) => t.id === task.id)) {
		console.log(`Backup already queued for task: ${task.name}`);
		return;
	}

	backupQueue.push(task);
	console.log(
		`Backup queued: ${task.name}. Queue length: ${backupQueue.length}`,
	);
	processBackupQueue();
}

function scheduleAll(storeInstance) {
	store = storeInstance;
	console.log("Initializing backups from store...");

	const tasks = store.get("tasks") || [];

	if (tasks.length === 0) {
		console.log("No backup tasks found in store");
		return;
	}

	// Initialize next dates for all tasks on startup
	let updated = false;
	tasks.forEach((task) => {
		if (!task.next && task.active && task.schedule) {
			console.log(
				`[scheduleAll] Initializing next date for task: ${task.name}`,
			);
			const taskWithoutNext = { ...task };
			scheduleOne(task.id);
			updated = true;
		} else {
			scheduleOne(task.id);
		}
	});

	console.log(`Initialized ${cronJobs.size} backup task(s)`);
}

function scheduleOne(id) {
	if (!store) {
		console.error("Store not initialized for scheduleOne");
		return;
	}

	const tasks = store.get("tasks") || [];
	const task = tasks.find((t) => t.id === id);

	if (!task) {
		console.error(`Task not found in store: ${id}`);
		return;
	}

	if (cronJobs.has(id)) {
		const existingJob = cronJobs.get(id);
		existingJob.stop();
		existingJob.destroy();
		cronJobs.delete(id);
		console.log(`Rescheduled existing job: ${task.name}`);
	}

	if (!task.active) {
		console.log(`Backup task disabled, not scheduling: ${task.name}`);
		clearNextRunDate(id);
		return;
	}

	try {
		const cronExpression = task.schedule;

		const job = cron.schedule(cronExpression, () => {
			console.log(`Cron trigger for backup: ${task.name}`);
			const currentTasks = store.get("tasks") || [];
			const currentTask = currentTasks.find((t) => t.id === id);
			if (currentTask) {
				queueBackup(currentTask);
			}
		});

		cronJobs.set(id, job);

		// Calculate and store the next execution date
		updateNextRunDate(id, cronExpression);

		console.log(`Cron job scheduled for: ${task.name} (${cronExpression})`);
	} catch (error) {
		console.error(
			`Failed to schedule backup task "${task.name}":`,
			error.message,
		);
	}
}

function stopAllSchedules() {
	console.log("Stopping all backup cron jobs...");

	cronJobs.forEach((job, taskId) => {
		job.stop();
		job.destroy();
		clearNextRunDate(taskId);
	});

	cronJobs.clear();
	backupQueue.length = 0;
	processingBackups.clear();
	console.log("All backup cron jobs stopped");
}

function getProcessingStatus() {
	return {
		processing: Array.from(processingBackups),
		queued: backupQueue.map((t) => t.id),
	};
}

/**
 * Remove/stop a scheduled backup by ID
 */
function scheduleDelete(id) {
	if (cronJobs.has(id)) {
		const job = cronJobs.get(id);
		job.stop();
		job.destroy();
		cronJobs.delete(id);
		console.log(`Stopped and removed schedule for task: ${id}`);
	}

	clearNextRunDate(id);

	// Remove from queue if it's there
	const queueIndex = backupQueue.findIndex((t) => t.id === id);
	if (queueIndex !== -1) {
		backupQueue.splice(queueIndex, 1);
		console.log(`Removed task ${id} from backup queue`);
	}
}

module.exports = {
	scheduleAll,
	stopAllSchedules,
	scheduleOne,
	scheduleDelete,
	setStore,
	setMainWindowReference,
	queueBackup,
	getProcessingStatus,
};
