const { app } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

/**
 * Enable auto-launch on system startup
 * Uses different methods based on the platform
 */
function enableAutoLaunch() {
	console.log("[AutoLaunch] Enabling auto-launch");
	if (process.platform === "win32" || process.platform === "darwin") {
		// Windows and macOS: Use Electron's built-in login item settings
		try {
			app.setLoginItemSettings({
				openAtLogin: true,
				openAsHidden: true, // Launch in background
			});
			console.log("[AutoLaunch] Auto-launch enabled (Windows/macOS)");
		} catch (error) {
			console.error("[AutoLaunch] Failed to enable auto-launch:", error);
		}
	} else if (process.platform === "linux") {
		// Linux: Create a .desktop file in ~/.config/autostart/
		try {
			const autoStartDir = path.join(os.homedir(), ".config/autostart");

			// Ensure directory exists
			if (!fs.existsSync(autoStartDir)) {
				fs.mkdirSync(autoStartDir, { recursive: true });
			}

			const desktopFilePath = path.join(autoStartDir, "backupr.desktop");
			const appPath = process.execPath;
			const appName = "Backupr";

			const desktopFileContent = `[Desktop Entry]
Type=Application
Exec=${appPath}
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Name=${appName}
Comment=Automatic backup tool
Icon=backupr
Terminal=false
`;

			fs.writeFileSync(desktopFilePath, desktopFileContent);
			console.log(
				`[AutoLaunch] Auto-launch enabled (Linux) at ${desktopFilePath}`,
			);
		} catch (error) {
			console.error(
				"[AutoLaunch] Failed to enable auto-launch on Linux:",
				error,
			);
		}
	}
}

/**
 * Disable auto-launch on system startup
 */
function disableAutoLaunch() {
	console.log("[AutoLaunch] Disabling auto-launch");
	if (process.platform === "win32" || process.platform === "darwin") {
		// Windows and macOS: Disable login item
		try {
			app.setLoginItemSettings({
				openAtLogin: false,
			});
			console.log("[AutoLaunch] Auto-launch disabled (Windows/macOS)");
		} catch (error) {
			console.error("[AutoLaunch] Failed to disable auto-launch:", error);
		}
	} else if (process.platform === "linux") {
		// Linux: Remove the .desktop file
		try {
			const desktopFilePath = path.join(
				os.homedir(),
				".config/autostart/backupr.desktop",
			);

			if (fs.existsSync(desktopFilePath)) {
				fs.unlinkSync(desktopFilePath);
				console.log("[AutoLaunch] Auto-launch disabled (Linux)");
			}
		} catch (error) {
			console.error(
				"[AutoLaunch] Failed to disable auto-launch on Linux:",
				error,
			);
		}
	}
}

/**
 * Check current auto-launch status
 */
function isAutoLaunchEnabled() {
	if (process.platform === "win32" || process.platform === "darwin") {
		try {
			const loginItemSettings = app.getLoginItemSettings();
			return loginItemSettings.openAtLogin;
		} catch (error) {
			console.error("[AutoLaunch] Failed to check auto-launch status:", error);
			return false;
		}
	} else if (process.platform === "linux") {
		try {
			const desktopFilePath = path.join(
				os.homedir(),
				".config/autostart/backupr.desktop",
			);
			return fs.existsSync(desktopFilePath);
		} catch (error) {
			console.error("[AutoLaunch] Failed to check auto-launch status:", error);
			return false;
		}
	}
	return false;
}

/**
 * Initialize auto-launch based on store settings
 */
function initializeAutoLaunch(store) {
	try {
		const startInBackground = store.get("startInBackground", false);
		console.log(
			`[AutoLaunch] Initializing auto-launch with stored setting: ${startInBackground}`,
		);

		if (startInBackground) {
			enableAutoLaunch();
		} else {
			disableAutoLaunch();
		}
	} catch (error) {
		console.error("[AutoLaunch] Failed to initialize auto-launch:", error);
	}
}

/**
 * Setup IPC handlers for auto-launch
 */
function setupAutoLaunchHandlers(ipcMain, store) {
	// Handle auto-launch toggle from settings
	ipcMain.handle("auto-launch-enable", async () => {
		enableAutoLaunch();
		return { success: true };
	});

	ipcMain.handle("auto-launch-disable", async () => {
		disableAutoLaunch();
		return { success: true };
	});

	ipcMain.handle("auto-launch-status", async () => {
		return {
			enabled: isAutoLaunchEnabled(),
		};
	});
}

module.exports = {
	enableAutoLaunch,
	disableAutoLaunch,
	isAutoLaunchEnabled,
	initializeAutoLaunch,
	setupAutoLaunchHandlers,
};
