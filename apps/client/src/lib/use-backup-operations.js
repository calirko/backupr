import { useEffect, useState } from "react";
import { toast } from "../components/ui/use-toast";
import { calculateNextBackup } from "./backup-utils";

export function useBackupOperations(settings, loadSyncItems) {
	const [uploading, setUploading] = useState(false);
	const [isPaused, setIsPaused] = useState(false);
	const [uploadProgress, setUploadProgress] = useState({
		message: "",
		percent: 0,
	});

	useEffect(() => {
		// Listen for progress updates
		if (window.electron?.onBackupProgress) {
			window.electron.onBackupProgress((data) => {
				console.log("Progress update received:", data);
				setUploadProgress(data);
				// Handle pause state from progress data
				if (data.paused !== undefined) {
					setIsPaused(data.paused);
				}
			});
		}
	}, []);

	const handleBackupItem = async (item) => {
		if (!settings.serverHost || !settings.apiKey) {
			toast({
				title: "Configuration required",
				description:
					"Please configure server settings first in the Settings tab",
				variant: "destructive",
			});
			return;
		}

		setUploading(true);
		setUploadProgress({ message: "Starting backup...", percent: 0 });

		try {
			if (window.electron) {
				let result;

				if (item.backupType === "firebird") {
					// Perform Firebird database backup
					result = await window.electron.performFirebirdBackup({
						serverHost: settings.serverHost,
						apiKey: settings.apiKey,
						backupName: item.name,
						dbPath: item.firebirdDbPath,
						gbakPath: item.gbakPath || undefined,
					});
				} else {
					// Perform normal file/folder backup
					result = await window.electron.performBackup({
						serverHost: settings.serverHost,
						apiKey: settings.apiKey,
						backupName: item.name,
						files: item.paths,
					});
				}

				if (result.success) {
					toast({
						title: "Backup successful",
						description: `"${item.name}" backed up successfully! Version ${result.version}`,
					});

					// Update last backup time
					const updatedItem = {
						...item,
						lastBackup: new Date().toISOString(),
						nextBackup: calculateNextBackup(
							item.interval,
							item.customHours,
							item.dailyTime,
							item.weeklyDay,
							item.weeklyTime,
						),
					};
					await window.electron.saveSyncItem(updatedItem);
					await loadSyncItems();
				} else {
					toast({
						title: "Backup failed",
						description: result.error || "An error occurred during backup",
						variant: "destructive",
					});
				}
			}
		} catch (error) {
			console.error("Backup error:", error);
			toast({
				title: "Backup error",
				description: error.message || "An unexpected error occurred",
				variant: "destructive",
			});
		} finally {
			setUploading(false);
			setUploadProgress({ message: "", percent: 0 });
		}
	};

	const handlePauseBackup = async () => {
		if (window.electron) {
			await window.electron.pauseBackup();
			setIsPaused(true);
		}
	};

	const handleResumeBackup = async () => {
		if (window.electron) {
			await window.electron.resumeBackup();
			setIsPaused(false);
		}
	};

	return {
		uploading,
		isPaused,
		uploadProgress,
		handleBackupItem,
		handlePauseBackup,
		handleResumeBackup,
	};
}
