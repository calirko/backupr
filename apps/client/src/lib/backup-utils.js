/**
 * Backup utility functions for the frontend
 * Now imports shared scheduler logic from local ES module version
 */

// Import shared scheduler utilities
export {
	calculateNextBackup,
	formatNextBackup,
	getIntervalDisplay,
} from "./scheduler-utils.js";
