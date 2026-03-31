const cron = require("node-cron");
const cronParser = require("cron-parser");
const { runBackup, setMainWindow, sendBackupStatus } = require("./backup");
const { sendBackupProgress } = require("./ws-client");

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

	try {
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
		await runBackup(task, store, (status) => {
			sendBackupProgress(
				task.name,
				status.type,
				status.progress ?? 0,
				status.description ?? status.title ?? "",
			);
		});
	} catch (error) {
		console.error(`Error processing backup queue for ${task.name}:`, error);
	} finally {
		// Ensure we always clean up state even if runBackup throws silently or stalls
		processingBackups.delete(task.id);

		// After a backup completes, recalculate the next run date
		const currentTasks = store.get("tasks") || [];
		const currentTask = currentTasks.find((t) => t.id === task.id);
		if (currentTask?.active && currentTask.schedule) {
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
		return;
	}

	if (backupQueue.some((t) => t.id === task.id)) {
		return;
	}

	backupQueue.push(task);
	processBackupQueue();
}

function scheduleAll(storeInstance) {
	store = storeInstance;

	const tasks = store.get("tasks") || [];

	if (tasks.length === 0) {
		return;
	}

	// Initialize next dates for all tasks on startup
	let _updated = false;
	tasks.forEach((task) => {
		if (!task.next && task.active && task.schedule) {
			const taskWithoutNext = { ...task };
			scheduleOne(task.id);
			_updated = true;
		} else {
			scheduleOne(task.id);
		}
	});
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
	}

	if (!task.active) {
		clearNextRunDate(id);
		return;
	}

	try {
		const cronExpression = task.schedule;

		const job = cron.schedule(cronExpression, () => {
			const currentTasks = store.get("tasks") || [];
			const currentTask = currentTasks.find((t) => t.id === id);
			if (currentTask) {
				queueBackup(currentTask);
			}
		});

		cronJobs.set(id, job);

		// Calculate and store the next execution date
		updateNextRunDate(id, cronExpression);
	} catch (error) {
		console.error(
			`Failed to schedule backup task "${task.name}":`,
			error.message,
		);
	}
}

function stopAllSchedules() {
	cronJobs.forEach((job, taskId) => {
		job.stop();
		job.destroy();
		clearNextRunDate(taskId);
	});

	cronJobs.clear();
	backupQueue.length = 0;
	processingBackups.clear();
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
	}

	clearNextRunDate(id);

	// Remove from queue if it's there
	const queueIndex = backupQueue.findIndex((t) => t.id === id);
	if (queueIndex !== -1) {
		backupQueue.splice(queueIndex, 1);
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
