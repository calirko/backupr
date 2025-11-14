import { Pause, Play, Plus, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import {
	calculateNextBackup,
	formatNextBackup,
	getIntervalDisplay,
} from "../lib/backup-utils";
import { useBackupOperations } from "../lib/use-backup-operations";
import { BackupForm } from "./BackupForm";
import { BackupItemCard } from "./BackupItemCard";
import { EmptyState } from "./EmptyState";
import { UploadProgress } from "./UploadProgress";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { useConfirm } from "./ui/use-confirm";
import { toast } from "./ui/use-toast";

export function Backup() {
	const [syncItems, setSyncItems] = useState([]);
	const [settings, setSettings] = useState({ serverHost: "", apiKey: "" });
	const [editingItem, setEditingItem] = useState(null);
	const [showAddForm, setShowAddForm] = useState(false);
	const [isGloballyPaused, setIsGloballyPaused] = useState(false);
	const [, setUpdateTrigger] = useState(0);

	// Confirm dialog hook
	const { confirm, confirmState, handleClose } = useConfirm();

	// Form state for new/edit item
	const [formData, setFormData] = useState({
		name: "",
		paths: [],
		backupType: "normal",
		firebirdDbPath: "",
		gbakPath: "",
		interval: "manual",
		customHours: "",
		dailyTime: "00:00",
		weeklyDay: "1",
		weeklyTime: "00:00",
		enabled: true,
	});

	const loadSettings = async () => {
		if (window.electron) {
			const data = await window.electron.getSettings();
			setSettings(data);
		}
	};

	const loadSyncItems = async () => {
		if (window.electron) {
			const items = await window.electron.getSyncItems();
			setSyncItems(items || []);
		}
	};

	// Use backup operations hook
	const {
		uploading,
		isPaused,
		uploadProgress,
		handleBackupItem: performBackup,
		handlePauseBackup,
		handleResumeBackup,
	} = useBackupOperations(settings, loadSyncItems);

	const handleBackupAll = async () => {
		if (isGloballyPaused) {
			toast({
				title: "Backups paused",
				description: "All backups are currently paused. Resume to continue.",
				variant: "destructive",
			});
			return;
		}

		const enabledItems = syncItems.filter((item) => item.enabled);
		if (enabledItems.length === 0) {
			toast({
				title: "No items to backup",
				description: "Please enable at least one sync item",
				variant: "destructive",
			});
			return;
		}

		for (const item of enabledItems) {
			await performBackup(item);
		}
	};

	useEffect(() => {
		loadSettings();
		loadSyncItems();

		// Listen for tray backup trigger
		if (window.electron?.onTriggerBackup) {
			window.electron.onTriggerBackup(() => {
				if (!isGloballyPaused) {
					handleBackupAll();
				}
			});
		}

		// Auto-update next backup times every 10 seconds
		const interval = setInterval(() => {
			setUpdateTrigger((prev) => prev + 1);
		}, 10000);

		return () => clearInterval(interval);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Effect to handle global pause communication with Electron
	useEffect(() => {
		if (window.electron?.setGlobalPause) {
			window.electron.setGlobalPause(isGloballyPaused);
		}
	}, [isGloballyPaused]);

	const handleSaveItem = async () => {
		if (!formData.name) {
			toast({
				title: "Name required",
				description: "Please enter a name for the sync item",
				variant: "destructive",
			});
			return;
		}

		if (formData.backupType === "normal" && formData.paths.length === 0) {
			toast({
				title: "No paths selected",
				description: "Please add at least one file or directory",
				variant: "destructive",
			});
			return;
		}

		if (formData.backupType === "firebird" && !formData.firebirdDbPath) {
			toast({
				title: "No database selected",
				description: "Please select a Firebird database file",
				variant: "destructive",
			});
			return;
		}

		if (window.electron) {
			const item = {
				...formData,
				id: editingItem?.id || null,
				lastBackup: editingItem?.lastBackup || null,
				nextBackup: calculateNextBackup(
					formData.interval,
					formData.customHours,
					formData.dailyTime,
					formData.weeklyDay,
					formData.weeklyTime,
				),
			};

			await window.electron.saveSyncItem(item);
			await loadSyncItems();
			resetForm();
		}
	};

	const handleEditItem = (item) => {
		setEditingItem(item);
		setFormData({
			name: item.name,
			paths: item.paths,
			interval: item.interval,
			customHours: item.customHours || "",
			dailyTime: item.dailyTime || "00:00",
			weeklyDay: item.weeklyDay || "1",
			weeklyTime: item.weeklyTime || "00:00",
			enabled: item.enabled,
			backupType: item.backupType || "normal",
			firebirdDbPath: item.firebirdDbPath || "",
			gbakPath: item.gbakPath || "",
		});
		setShowAddForm(true);
	};

	const handleDeleteItem = async (itemId) => {
		const confirmed = await confirm({
			title: "Delete Sync Item",
			description:
				"Are you sure you want to delete this sync item? This action cannot be undone.",
			confirmText: "Delete",
			cancelText: "Cancel",
			variant: "destructive",
		});

		if (confirmed) {
			if (window.electron) {
				await window.electron.deleteSyncItem(itemId);
				await loadSyncItems();
			}
		}
	};

	const resetForm = () => {
		setFormData({
			name: "",
			paths: [],
			interval: "manual",
			customHours: "",
			dailyTime: "00:00",
			weeklyDay: "1",
			weeklyTime: "00:00",
			enabled: true,
			backupType: "normal",
			firebirdDbPath: "",
			gbakPath: "",
		});
		setEditingItem(null);
		setShowAddForm(false);
	};

	const handleBackupItem = async (item) => {
		if (isGloballyPaused) {
			toast({
				title: "Backups paused",
				description: "All backups are currently paused. Resume to continue.",
				variant: "destructive",
			});
			return;
		}
		await performBackup(item);
	};

	return (
		<div className="space-y-6">
			{/* Header with Add Button */}
			<div className="flex justify-between items-center">
				<div>
					<h2 className="text-2xl font-bold">Sync Items</h2>
					<p className="text-muted-foreground">
						Manage your backup configurations
						<br />
						{isGloballyPaused && (
							<span className="text-orange-600 font-medium">
								All backups paused
							</span>
						)}
					</p>
				</div>
				<div className="flex gap-2">
					<Button onClick={() => setShowAddForm(true)} className="gap-2">
						<Plus className="h-4 w-4" />
						Add Sync Item
					</Button>
				</div>
			</div>

			{/* Upload Progress */}
			{uploading && (
				<UploadProgress
					uploadProgress={uploadProgress}
					isPaused={isPaused}
					onPause={handlePauseBackup}
					onResume={handleResumeBackup}
				/>
			)}

			{/* Add/Edit Form */}
			{showAddForm && (
				<BackupForm
					formData={formData}
					setFormData={setFormData}
					editingItem={editingItem}
					onSave={handleSaveItem}
					onCancel={resetForm}
				/>
			)}

			{/* Sync Items Grid */}
			{syncItems.length === 0 && !showAddForm ? (
				<EmptyState onAddClick={() => setShowAddForm(true)} />
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{syncItems.map((item) => (
						<BackupItemCard
							key={item.id}
							item={item}
							onEdit={handleEditItem}
							onDelete={handleDeleteItem}
							onBackup={handleBackupItem}
							uploading={uploading}
							isGloballyPaused={isGloballyPaused}
							formatNextBackup={formatNextBackup}
							getIntervalDisplay={getIntervalDisplay}
						/>
					))}
				</div>
			)}

			<div className="flex gap-2">
				<Button
					onClick={() => setIsGloballyPaused(!isGloballyPaused)}
					variant={isGloballyPaused ? "destructive" : "outline"}
					className="gap-2"
				>
					{isGloballyPaused ? (
						<>
							<Play className="h-4 w-4" />
							Resume All
						</>
					) : (
						<>
							<Pause className="h-4 w-4" />
							Pause All
						</>
					)}
				</Button>
				{/* Backup All Button */}
				{syncItems.length > 0 && (
					<Button
						onClick={handleBackupAll}
						disabled={uploading || isGloballyPaused}
						className="w-full"
					>
						{isGloballyPaused ? (
							<>
								<Pause className="mr-2 h-5 w-5" />
								All Backups Paused
							</>
						) : (
							<>
								<Upload className="mr-2 h-5 w-5" />
								Backup All
							</>
						)}
					</Button>
				)}
			</div>

			{/* Confirm Dialog */}
			<ConfirmDialog
				isOpen={confirmState.isOpen}
				onClose={handleClose}
				onConfirm={confirmState.onConfirm}
				title={confirmState.title}
				description={confirmState.description}
				confirmText={confirmState.confirmText}
				cancelText={confirmState.cancelText}
				variant={confirmState.variant}
			/>
		</div>
	);
}
