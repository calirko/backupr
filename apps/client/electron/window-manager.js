const { BrowserWindow, Tray, Menu, app } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

/**
 * Create the main application window
 */
function createWindow() {
	// Determine the correct icon path based on platform
	let iconPath;
	if (process.platform === "win32") {
		// For Windows, use ICO format
		if (app.isPackaged) {
			// Try multiple possible locations for packaged app
			const possiblePaths = [
				path.join(process.resourcesPath, "icon.ico"),
				path.join(
					process.resourcesPath,
					"app.asar.unpacked",
					"build",
					"icon.ico",
				),
				path.join(path.dirname(process.execPath), "resources", "icon.ico"),
			];

			iconPath = possiblePaths.find((p) => fs.existsSync(p));
			if (!iconPath) {
				console.warn("Could not find icon.ico in packaged app, using default");
			}
		} else {
			iconPath = path.join(__dirname, "../build/icon.ico");
		}
	} else if (process.platform === "darwin") {
		// For macOS
		iconPath = app.isPackaged
			? path.join(process.resourcesPath, "icon.icns")
			: path.join(__dirname, "../build/icon.icns");
	} else {
		// For Linux, use PNG
		iconPath = app.isPackaged
			? path.join(process.resourcesPath, "icon.png")
			: path.join(__dirname, "../build/icon.png");
	}

	console.log("Window icon path:", iconPath);
	console.log(
		"Window icon exists:",
		iconPath ? fs.existsSync(iconPath) : false,
	);

	const mainWindow = new BrowserWindow({
		width: 500,
		height: 600,
		minHeight: 600,
		minWidth: 500,
		maxHeight: 900,
		maxWidth: 800,
		show: false,
		frame: false, // Remove window frame
		autoHideMenuBar: true, // Remove menu bar
		icon: iconPath, // Set the window icon
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(__dirname, "preload.js"),
		},
	});

	mainWindow.setMenu(null);

	// Remove the menu bar completely
	Menu.setApplicationMenu(null);

	// Load the app
	const startUrl =
		process.env.ELECTRON_START_URL ||
		`file://${path.join(__dirname, "../dist/index.html")}`;
	mainWindow.loadURL(startUrl);

	// Show window when ready
	mainWindow.once("ready-to-show", () => {
		// This will be set by the store in main.js
		const startInBackground = mainWindow._startInBackground || false;

		if (!startInBackground) {
			mainWindow.show();
		}
	});

	// handle crashes
	mainWindow.webContents.on("crashed", () => {
		mainWindow.reload();
	});

	// Hide on close instead of quitting
	mainWindow.on("close", (event) => {
		if (!app.isQuitting) {
			event.preventDefault();
			mainWindow.hide();
		}
		return false;
	});

	return mainWindow;
}

/**
 * Create the system tray icon and menu
 */
function createTray(mainWindow, store) {
	// Determine the correct icon path based on platform and environment
	let iconPath;
	if (process.platform === "win32") {
		// For Windows, use ICO format
		iconPath = app.isPackaged
			? path.join(process.resourcesPath, "tray-icon.ico")
			: path.join(__dirname, "../build/tray-icon.ico");
	} else if (process.platform === "darwin") {
		// For macOS
		iconPath = app.isPackaged
			? path.join(process.resourcesPath, "tray.png")
			: path.join(__dirname, "../build/tray.png");
	} else {
		// For Linux
		iconPath = app.isPackaged
			? path.join(process.resourcesPath, "tray.png")
			: path.join(__dirname, "../build/tray.png");
	}

	// Log the icon path for debugging
	console.log("Tray icon path:", iconPath);
	console.log("Icon exists:", fs.existsSync(iconPath));
	console.log("Is packaged:", app.isPackaged);
	console.log("Resources path:", process.resourcesPath);

	// Verify icon exists before creating tray
	if (!fs.existsSync(iconPath)) {
		console.error("Tray icon not found at:", iconPath);
		// Try alternative path for Windows
		if (process.platform === "win32" && app.isPackaged) {
			const altPath = path.join(
				path.dirname(process.execPath),
				"resources",
				"tray-icon.ico",
			);
			console.log("Trying alternative path:", altPath);
			if (fs.existsSync(altPath)) {
				iconPath = altPath;
			}
		}
	}

	const tray = new Tray(iconPath);

	const contextMenu = Menu.buildFromTemplate([
		{
			label: "Show Backupr",
			click: () => {
				mainWindow.show();
				mainWindow.focus();
			},
		},
		{
			label: "Hide Backupr",
			click: () => {
				mainWindow.hide();
			},
		},
		{ type: "separator" },
		{
			label: "Backup Now",
			click: () => {
				mainWindow.show();
				mainWindow.focus();
				mainWindow.webContents.send("trigger-backup");
			},
		},
		{ type: "separator" },
		{
			label: "Check for Updates",
			click: () => {
				store.set("manualUpdateCheck", true);
				const { autoUpdater } = require("electron-updater");
				autoUpdater.checkForUpdates();
			},
		},
		{ type: "separator" },
		{
			label: "Open Dev Tools",
			click: () => {
				mainWindow.webContents.openDevTools();
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

	tray.setToolTip("Backupr - File Backup");
	tray.setContextMenu(contextMenu);

	// Platform-specific behavior
	if (process.platform === "win32") {
		// Windows: Right-click shows menu, left-click toggles window
		tray.on("click", () => {
			if (mainWindow.isVisible()) {
				mainWindow.hide();
			} else {
				mainWindow.show();
				mainWindow.focus();
			}
		});
	} else {
		// macOS/Linux: Handle double-click to show/hide window
		tray.on("double-click", () => {
			if (mainWindow.isVisible()) {
				mainWindow.hide();
			} else {
				mainWindow.show();
				mainWindow.focus();
			}
		});

		// Single click shows the window
		tray.on("click", () => {
			mainWindow.show();
			mainWindow.focus();
		});
	}

	return tray;
}

module.exports = {
	createWindow,
	createTray,
};
