/**
 * Scheduler utility functions (Frontend ES Module version)
 * Shared logic for calculating backup schedules and formatting intervals
 */

/**
 * Calculate next backup time based on interval
 * @param {string} interval - The backup interval type (manual, hourly, daily, weekly, custom)
 * @param {string|number} customHours - Hours for custom interval
 * @param {string} dailyTime - Time for daily backups (HH:MM format)
 * @param {string|number} weeklyDay - Day of week for weekly backups (0-6, Sunday=0)
 * @param {string} weeklyTime - Time for weekly backups (HH:MM format)
 * @returns {Date|null} Next backup time or null if manual
 */
export function calculateNextBackup(
	interval,
	customHours,
	dailyTime,
	weeklyDay,
	weeklyTime,
) {
	const now = new Date();

	switch (interval) {
		case "manual":
			return null;
		case "hourly":
			return new Date(now.getTime() + 60 * 60 * 1000);
		case "daily": {
			// Calculate next daily backup at specified time
			const [hours, minutes] = (dailyTime || "00:00").split(":").map(Number);
			const next = new Date(now);
			next.setHours(hours, minutes, 0, 0);

			// If the time today has passed, schedule for tomorrow
			if (next < now) {
				next.setDate(next.getDate() + 1);
			}
			return next;
		}
		case "weekly": {
			// Calculate next weekly backup at specified day and time
			const [hours, minutes] = (weeklyTime || "00:00").split(":").map(Number);
			const targetDay = parseInt(weeklyDay, 10) || 1;
			const next = new Date(now);
			next.setHours(hours, minutes, 0, 0);

			// Calculate days until target day
			const currentDay = next.getDay();
			let daysUntilTarget = targetDay - currentDay;

			// If target day is today but time has passed, or target is before today, go to next week
			if (daysUntilTarget < 0 || (daysUntilTarget === 0 && next <= now)) {
				daysUntilTarget += 7;
			}

			next.setDate(next.getDate() + daysUntilTarget);
			return next;
		}
		case "custom": {
			const hours = parseInt(customHours, 10) || 1;
			return new Date(now.getTime() + hours * 60 * 60 * 1000);
		}
		default:
			return null;
	}
}

/**
 * Get human-readable interval display
 * @param {string} interval - The backup interval type
 * @param {string|number} customHours - Hours for custom interval
 * @param {string} dailyTime - Time for daily backups
 * @param {string|number} weeklyDay - Day of week for weekly backups (0-6)
 * @param {string} weeklyTime - Time for weekly backups
 * @returns {string} Human-readable interval description
 */
export function getIntervalDisplay(
	interval,
	customHours,
	dailyTime,
	weeklyDay,
	weeklyTime,
) {
	const dayNames = [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
	];

	switch (interval) {
		case "manual":
			return "Manual";
		case "hourly":
			return "Every hour";
		case "daily":
			return `Daily at ${dailyTime || "00:00"}`;
		case "weekly": {
			const day = dayNames[parseInt(weeklyDay) || 1];
			return `Weekly on ${day} at ${weeklyTime || "00:00"}`;
		}
		case "custom":
			return `Every ${customHours || 1} hour${(customHours || 1) > 1 ? "s" : ""}`;
		default:
			return interval;
	}
}

/**
 * Format next backup time into human-readable countdown
 * @param {string|Date} nextBackup - ISO string or Date object of next backup
 * @returns {string} Human-readable countdown (e.g., "in 2h 15m", "in 3 days")
 */
export function formatNextBackup(nextBackup) {
	if (!nextBackup) return "Manual";

	const date =
		typeof nextBackup === "string" ? new Date(nextBackup) : nextBackup;
	const now = new Date();
	const diff = date - now;

	if (diff < 0) return "Overdue";

	const hours = Math.floor(diff / (1000 * 60 * 60));
	const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

	if (hours > 24) {
		const days = Math.floor(hours / 24);
		return `in ${days} day${days > 1 ? "s" : ""}`;
	} else if (hours > 0) {
		return `in ${hours}h ${minutes}m`;
	} else {
		return `in ${minutes}m`;
	}
}
