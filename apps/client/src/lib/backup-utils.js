export const calculateNextBackup = (
	interval,
	customHours,
	dailyTime,
	weeklyDay,
	weeklyTime,
) => {
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

			console.log("Calculated daily next backup time:", next);
			console.log("Current time:", now);
			console.log(next < now);

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
};

export const getIntervalDisplay = (
	interval,
	customHours,
	dailyTime,
	weeklyDay,
	weeklyTime,
) => {
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
};

export const formatNextBackup = (nextBackup) => {
	if (!nextBackup) return "Manual";
	const date = new Date(nextBackup);
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
};
