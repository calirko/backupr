const { Notification } = require("electron");
const path = require("node:path");

/**
 * Get the appropriate icon path based on the operating system
 * @returns {string} Path to the icon file
 */
function getIconPath() {
	const iconDir = path.join(__dirname, "../public/icons");
	if (process.platform === "win32") {
		return path.join(iconDir, "icon.ico");
	} else if (process.platform === "darwin") {
		return path.join(iconDir, "icon.icns");
	} else {
		return path.join(iconDir, "icon.png");
	}
}

/**
 * Send a desktop notification
 * Works even when the window is minimized or closed
 * @param {string} title - Notification title
 * @param {Object} options - Notification options
 * @param {string} options.body - Notification message body
 */
function sendNotification(title, options = {}) {
	try {
		// Check if notifications are supported
		if (!Notification.isSupported()) {
			console.warn("Desktop notifications are not supported on this platform");
			return;
		}

		const notification = new Notification({
			title,
			icon: getIconPath(),
			...options,
		});

		notification.show();
		return notification;
	} catch (error) {
		console.error("Failed to send notification:", error);
	}
}

/**
 * Send a success notification for completed backup
 * @param {string} backupName - Name of the backup
 */
function notifyBackupSuccess(backupName) {
	sendNotification("Backup Completed", {
		body: `Backup for "${backupName}" completed successfully`,
	});
}

/**
 * Send an error notification for failed backup
 * @param {string} backupName - Name of the backup
 * @param {string} errorMessage - Error message
 */
function notifyBackupError(backupName, errorMessage) {
	sendNotification("Backup Failed", {
		body: `Backup for "${backupName}" failed: ${errorMessage}`,
	});
}

module.exports = {
	sendNotification,
	notifyBackupSuccess,
	notifyBackupError,
};
