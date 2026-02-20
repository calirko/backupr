const { contextBridge, ipcRenderer } = require("electron");

console.log("Preload script loaded");

contextBridge.exposeInMainWorld("electron", {
	minimizeWindow: () => {
		console.log("IPC: minimize-window");
		ipcRenderer.send("minimize-window");
	},
	closeWindow: () => {
		console.log("IPC: close-window");
		ipcRenderer.send("close-window");
	},
	openFileDialog: (options) => ipcRenderer.invoke("open-file-dialog", options),
	scheduleUpdate: (taskId) => ipcRenderer.invoke("schedule-update", taskId),
	scheduleDelete: (taskId) => ipcRenderer.invoke("schedule-delete", taskId),
	scheduleGetStatus: () => ipcRenderer.invoke("schedule-get-status"),
	ipcRenderer: {
		on: (channel, callback) => {
			const listener = (_event, data) => callback(data);
			ipcRenderer.on(channel, listener);
			// Return unsubscribe function
			return () => ipcRenderer.off(channel, listener);
		},
		invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
	},
});

contextBridge.exposeInMainWorld("store", {
	get: (key) => ipcRenderer.invoke("store-get", key),
	set: (key, value) => ipcRenderer.invoke("store-set", key, value),
	delete: (key) => ipcRenderer.invoke("store-delete", key),
	clear: () => ipcRenderer.invoke("store-clear"),
	has: (key) => ipcRenderer.invoke("store-has", key),
	getAll: () => ipcRenderer.invoke("store-getAll"),
});

contextBridge.exposeInMainWorld("backup", {
	run: (taskId) => ipcRenderer.invoke("backup-run", taskId),
});
