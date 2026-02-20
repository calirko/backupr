const { app, BrowserWindow, Tray } = require("electron/main");
const path = require("node:path");
const { Menu } = require("electron/main");
const Store = require("electron-store");
const { initIPC, stopAllSchedules } = require("./electron/ipc");
const { initializeAutoLaunch } = require("./electron/auto-launch");
const {
	configureAutoUpdater,
	setupAutoUpdaterHandlers,
	checkForUpdatesOnStartup,
	checkForUpdatesManually,
} = require("./electron/auto-update");
const {
	initWsClient,
	shutdown: shutdownWsClient,
} = require("./electron/ws-client");

const store = new Store();

let win, tray;

const instanceLock = app.requestSingleInstanceLock();

if (!instanceLock) {
	app.quit();
}

app.on("second-instance", () => {
	if (win) {
		if (win.isVisible()) {
			win.focus();
		} else {
			win.show();
			win.focus();
		}
	}
});

function getIconPath() {
	const iconDir = path.join(__dirname, "./public/icons");
	if (process.platform === "win32") {
		return path.join(iconDir, "icon.ico");
	} else if (process.platform === "darwin") {
		return path.join(iconDir, "icon.icns");
	} else {
		return path.join(iconDir, "icon.png");
	}
}

function createTray() {
	tray = new Tray(getIconPath());

	const contextMenu = Menu.buildFromTemplate([
		{
			label: "Show Backupr",
			click: () => {
				win.show();
				win.focus();
			},
		},
		{
			label: "Hide Backupr",
			click: () => {
				win.hide();
			},
		},
		{ type: "separator" },
		{
			label: "Check for Updates",
			click: () => {
				checkForUpdatesManually(store);
			},
		},
		{ type: "separator" },
		{
			label: "Open Dev Tools",
			click: () => {
				win.webContents.openDevTools();
			},
		},
		{
			label: "Quit Backupr",
			click: () => {
				app.isQuitting = true;
				app.quit();
			},
		},
	]);

	tray.setToolTip("Backupr");
	tray.setContextMenu(contextMenu);

	tray.on("click", () => {
		win.isVisible() ? win.hide() : win.show();
	});
}

function createWindow() {
	win = new BrowserWindow({
		width: 450,
		height: 570,
		minHeight: 570,
		minWidth: 450,
		maxHeight: 900,
		maxWidth: 800,
		show: false,
		frame: false,
		autoHideMenuBar: true,
		icon: getIconPath(),
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(__dirname, "electron/preload.js"),
		},
	});

	// parse the start URL from an environment variable or default to the local file
	const startUrl =
		process.env.ELECTRON_START_URL ||
		`file://${path.join(__dirname, "../dist/index.html")}`;

	win.loadURL(startUrl);

	// Open dev tools in development
	if (process.env.ELECTRON_START_URL) {
		win.webContents.openDevTools();
	}

	// Show window when ready
	win.once("ready-to-show", () => {
		win.show();
	});

	// Handle window close - hide instead of close
	win.on("close", (e) => {
		if (!app.isQuitting) {
			e.preventDefault();
			win.hide();
		}
	});
}

app.whenReady().then(() => {
	configureAutoUpdater();
	createWindow();
	setupAutoUpdaterHandlers(win, store);
	initIPC(win, store);
	initializeAutoLaunch(store);
	initWsClient(store, win);
	createTray();
	checkForUpdatesOnStartup();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("before-quit", () => {
	console.log(
		"App quitting - stopping all backup schedules and WebSocket client",
	);
	stopAllSchedules();
	shutdownWsClient();
});
