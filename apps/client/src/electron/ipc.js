const { ipcMain, dialog } = require("electron");
const { setMainWindow } = require("./backup");
const { reconnect: reconnectWs, getWsStatus } = require("./ws-client");
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
	setMainWindow(win);
	setMainWindowReference(win);
	setStore(store);

	scheduleAll(store);
	setupAutoLaunchHandlers(ipcMain, store);

	ipcMain.on("minimize-window", () => {
		win?.minimize();
	});

	ipcMain.on("close-window", () => {
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
		scheduleOne(taskId);
	});

	ipcMain.handle("schedule-delete", (_event, taskId) => {
		scheduleDelete(taskId);
	});

	ipcMain.handle("schedule-get-status", () => {
		return getProcessingStatus();
	});

	ipcMain.handle("ws-get-status", () => {
		return getWsStatus();
	});

	ipcMain.handle("ws-reconnect", () => {
		const { processing, queued } = getProcessingStatus();
		if (processing.length > 0 || queued.length > 0) {
			return { ok: false, reason: "A backup is currently in progress" };
		}
		reconnectWs();
		return { ok: true };
	});
}

module.exports = {
	initIPC,
	stopAllSchedules,
};
