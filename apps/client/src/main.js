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

// Ensure the app name is always shown as "Backupr", not the appId
app.setName("Backupr");

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
	// In packaged builds, icons are extracted via extraResources to process.resourcesPath/icons/
	// Native Win32 APIs used by Tray cannot read from inside an ASAR archive.
	const iconDir = app.isPackaged
		? path.join(process.resourcesPath, "icons")
		: path.join(__dirname, "./public/icons");
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

	// Single-click toggles on Linux/macOS; double-click is standard on Windows
	tray.on("click", () => {
		win.isVisible() ? win.hide() : win.show();
	});
	tray.on("double-click", () => {
		win.show();
		win.focus();
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

	if (process.env.ELECTRON_START_URL) {
		win.loadURL(process.env.ELECTRON_START_URL);
		win.webContents.openDevTools();
	} else {
		// loadFile handles ASAR paths correctly on all platforms
		win.loadFile(path.join(__dirname, "../dist/index.html"));
	}

	// Show window when ready (dev only - production starts in system tray)
	win.once("ready-to-show", () => {
		if (process.env.ELECTRON_START_URL) {
			win.show();
		}
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
	stopAllSchedules();
	shutdownWsClient();
});
