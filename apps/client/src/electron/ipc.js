const { ipcMain, dialog } = require("electron");
const { setMainWindow } = require("./backup");
const {
	scheduleAll,
	stopAllSchedules,
	scheduleOne,
	scheduleDelete,
	setStore,
	setMainWindowReference,
	queueBackup,
	getProcessingStatus,
} = require("./schedule");
const { setupAutoLaunchHandlers } = require("./auto-launch");

function initIPC(win, store) {
	console.log("Initializing IPC handlers");

	setMainWindow(win);
	setMainWindowReference(win);
	setStore(store);

	scheduleAll(store);
	setupAutoLaunchHandlers(ipcMain, store);

	ipcMain.on("minimize-window", () => {
		console.log("Received: minimize-window");
		win?.minimize();
	});

	ipcMain.on("close-window", () => {
		console.log("Received: close-window");
		win?.hide();
	});

	ipcMain.handle("open-file-dialog", async (_event, options = {}) => {
		try {
			const result = await dialog.showOpenDialog(win, {
				properties: ["openFile", "multiSelections"],
				...options,
			});
			return result.filePaths;
		} catch (error) {
			console.error("File dialog error:", error);
			return [];
		}
	});

	ipcMain.handle("store-get", (_event, key) => {
		return store.get(key);
	});

	ipcMain.handle("store-set", (_event, key, value) => {
		console.log("Store set:", key, value);
		store.set(key, value);
	});

	ipcMain.handle("store-delete", (_event, key) => {
		store.delete(key);
	});

	ipcMain.handle("store-clear", () => {
		store.clear();
	});

	ipcMain.handle("store-has", (_event, key) => {
		return store.has(key);
	});

	ipcMain.handle("store-getAll", () => {
		return store.store;
	});

	ipcMain.handle("backup-run", async (_event, taskId) => {
		const tasks = store.get("tasks") || [];
		const task = tasks.find((t) => t.id === taskId);

		if (!task) {
			throw new Error(`Backup task with id "${taskId}" not found`);
		}

		queueBackup(task);

		return store.get("tasks");
	});

	ipcMain.handle("schedule-update", (_event, taskId) => {
		console.log("Received: schedule-update for task", taskId);
		scheduleOne(taskId);
	});

	ipcMain.handle("schedule-delete", (_event, taskId) => {
		console.log("Received: schedule-delete for task", taskId);
		scheduleDelete(taskId);
	});

	ipcMain.handle("schedule-get-status", () => {
		return getProcessingStatus();
	});
}

module.exports = {
	initIPC,
	stopAllSchedules,
};
