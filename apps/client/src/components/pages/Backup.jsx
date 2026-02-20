import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { BackupItemCard } from "../BackupItemCard";
import { AddBackupDialog } from "../dialog/addBackup";
import Status from "../Status";
import { Button } from "../ui/button";

export function BackupPage() {
	const [syncItems, setSyncItems] = useState([]);
	const [addDialog, setAddDialog] = useState({
		open: false,
		isEdit: false,
	});

	useEffect(() => {
		loadTasks();

		if (!window.electron) return;

		// Listen for backup completion - reload tasks to get updated next date
		const unsubscribe = window.electron.ipcRenderer.on(
			"backup-status",
			(status) => {
				console.log("Backup status received in Backup page:", status);
				if (status.type === "success") {
					console.log(
						"Backup completed, reloading tasks to get updated next date...",
					);
					// Delay slightly to ensure store is updated
					setTimeout(() => {
						loadTasks();
					}, 500);
				}
			},
		);

		return () => {
			if (unsubscribe) unsubscribe();
		};
	}, []);

	const loadTasks = async () => {
		const tasks = (await window.store.get("tasks")) || [];
		console.log("Loaded tasks from store:", tasks);
		setSyncItems(tasks);
	};

	const handleDialogClose = async () => {
		setAddDialog({ open: false, isEdit: false });
		loadTasks();

		// Trigger schedule update for the task
		if (addDialog.isEdit) {
			await window.electron.scheduleUpdate(addDialog.isEdit);
		} else {
			// For new backups, get the last created task
			const tasks = await window.store.get("tasks");
			if (tasks && tasks.length > 0) {
				const lastTask = tasks[tasks.length - 1];
				await window.electron.scheduleUpdate(lastTask.id);
			}
		}
	};

	async function handleDelete(id) {
		const backups = (await window.store.get("tasks")) || [];
		const updatedBackups = backups.filter((backup) => backup.id !== id);
		await window.store.set("tasks", updatedBackups);

		// Trigger schedule delete for the removed task
		await window.electron.scheduleDelete(id);

		loadTasks();
	}

	return (
		<div className="space-y-6">
			<Status
				onStatusChange={(e) => {
					if (e.type === "success") loadTasks();
				}}
			/>

			<div className="flex justify-between items-center">
				<div>
					<h2 className="text-xl font-bold">Sync Items</h2>
					<p className="text-muted-foreground text-xs">
						Manage your backup configurations
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						onClick={() => {
							setAddDialog({ open: true, isEdit: false });
						}}
						variant="outline"
					>
						<Plus className="h-4" />
						Add Sync Item
					</Button>
				</div>
			</div>

			{/* Sync Items Grid */}
			{syncItems.length === 0 ? (
				<div className="w-full flex items-center justify-center h-60">
					<p className="text-muted-foreground text-sm">No items to backup</p>
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{syncItems.map((item) => (
						<BackupItemCard
							key={item.id}
							item={item}
							onEdit={() => {
								setAddDialog({ open: true, isEdit: item.id });
							}}
							onDelete={() => {
								handleDelete(item.id);
							}}
							onBackup={() => {
								loadTasks();
							}}
						/>
					))}
				</div>
			)}

			<AddBackupDialog
				visible={addDialog.open}
				onClose={handleDialogClose}
				isEdit={addDialog.isEdit}
			/>
		</div>
	);
}
