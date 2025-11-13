const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
	getSettings: () => ipcRenderer.invoke("get-settings"),
	saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
	getBackupConfig: () => ipcRenderer.invoke("get-backup-config"),
	saveBackupConfig: (config) =>
		ipcRenderer.invoke("save-backup-config", config),
	selectFiles: () => ipcRenderer.invoke("select-files"),
	selectFilesOnly: () => ipcRenderer.invoke("select-files-only"),
	selectDirectories: () => ipcRenderer.invoke("select-directories"),
	selectFirebirdDb: () => ipcRenderer.invoke("select-firebird-db"),
	performBackup: (params) => ipcRenderer.invoke("perform-backup", params),
	performFirebirdBackup: (params) =>
		ipcRenderer.invoke("perform-firebird-backup", params),
	pauseBackup: () => ipcRenderer.invoke("pause-backup"),
	resumeBackup: () => ipcRenderer.invoke("resume-backup"),
	getBackupHistory: () => ipcRenderer.invoke("get-backup-history"),
	getSyncItems: () => ipcRenderer.invoke("get-sync-items"),
	saveSyncItem: (item) => ipcRenderer.invoke("save-sync-item", item),
	deleteSyncItem: (itemId) => ipcRenderer.invoke("delete-sync-item", itemId),
	onBackupProgress: (callback) => {
		ipcRenderer.on("backup-progress", (_event, data) => callback(data));
	},
	onTriggerBackup: (callback) => {
		ipcRenderer.on("trigger-backup", () => callback());
	},
	// Window controls
	minimizeWindow: () => ipcRenderer.invoke("minimize-window"),
	closeWindow: () => ipcRenderer.invoke("close-window"),
	// Auto-update controls
	checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
	getAppVersion: () => ipcRenderer.invoke("get-app-version"),
	onUpdateStatus: (callback) => {
		ipcRenderer.on("update-status", (_event, text) => callback(text));
	},
	onUpdateDownloadProgress: (callback) => {
		ipcRenderer.on("update-download-progress", (_event, data) =>
			callback(data),
		);
	},
	// Startup behavior
	getStartupBehavior: () => ipcRenderer.invoke("get-startup-behavior"),
	setStartupBehavior: (settings) =>
		ipcRenderer.invoke("set-startup-behavior", settings),
});
