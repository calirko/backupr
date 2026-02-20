import { File, Plus, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "../../hooks/use-toast";
import { Button } from "../ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export function AddBackupDialog({ visible, onClose, isEdit }) {
	const [backupName, setBackupName] = useState("");
	const [cronSchedule, setCronSchedule] = useState("");
	const [paths, setPaths] = useState([]);
	const [isActive, setIsActive] = useState(true);

	async function loadExistingBackup(id) {
		const tasks = (await window.store.get("tasks")) || [];
		const backupToEdit = tasks.find((task) => task.id === id);
		if (backupToEdit) {
			setBackupName(backupToEdit.name);
			setCronSchedule(backupToEdit.schedule);
			setPaths(backupToEdit.paths || []);
			setIsActive(backupToEdit.active ?? true);
		} else {
			console.error(`Backup with id "${id}" not found for editing`);
			onClose();
		}
	}

	useEffect(() => {
		if (isEdit && visible) {
			loadExistingBackup(isEdit);
		}
	}, [isEdit, visible]);

	function handleBackdropClick(e) {
		if (e.target === e.currentTarget) {
			onClose();
			resetForm();
		}
	}

	function handleKeyDown(e) {
		if (e.key === "Escape") {
			onClose();
			resetForm();
		}
	}

	function handleAddFilesOnly() {
		window.electron.openFileDialog().then((filePaths) => {
			if (filePaths && filePaths.length > 0) {
				setPaths((prev) => [...prev, ...filePaths]);
			}
		});
	}

	function handleRemovePath(index) {
		setPaths((prev) => prev.filter((_, i) => i !== index));
	}

	function resetForm() {
		setBackupName("");
		setCronSchedule("");
		setPaths([]);
		setIsActive(true);
	}

	async function handleAddBackup() {
		if (!backupName.trim()) {
			toast({
				title: "Validation Error",
				description: "Please enter a backup name.",
				variant: "destructive",
			});
			return;
		}
		if (!cronSchedule.trim() || cronSchedule.split(" ").length < 5) {
			toast({
				title: "Validation Error",
				description: "Please enter a cron schedule.",
				variant: "destructive",
			});
			return;
		}
		if (paths.length === 0) {
			toast({
				title: "Validation Error",
				description: "Please add at least one file or folder to backup.",
				variant: "destructive",
			});
			return;
		}

		const newBackup = {
			id: Date.now().toString(),
			name: backupName,
			schedule: cronSchedule,
			paths: paths,
			active: isActive,
			lastBackupDate: null,
			lastBackupCompleted: null,
		};

		const tasks = (await window.store.get("tasks")) || [];
		tasks.push(newBackup);
		await window.store.set("tasks", tasks);

		resetForm();
		onClose();
		toast({
			title: "Backup created!",
			description: "Your backup configuration has been created successfully.",
		});
	}

	async function handleUpdateBackup() {
		if (!backupName.trim()) {
			toast({
				title: "Validation Error",
				description: "Please enter a backup name.",
				variant: "destructive",
			});
			return;
		}

		if (!cronSchedule.trim() || cronSchedule.split(" ").length < 5) {
			toast({
				title: "Validation Error",
				description: "Please enter a cron schedule.",
				variant: "destructive",
			});
			return;
		}

		if (paths.length === 0) {
			toast({
				title: "Validation Error",
				description: "Please add at least one file or folder to backup.",
				variant: "destructive",
			});
			return;
		}

		const tasks = (await window.store.get("tasks")) || [];
		const updatedTasks = tasks.map((task) => {
			if (task.id === isEdit) {
				return {
					...task,
					name: backupName,
					schedule: cronSchedule,
					paths: paths,
					active: isActive,
				};
			}
			return task;
		});

		await window.store.set("tasks", updatedTasks);
		resetForm();
		onClose();
		toast({
			title: "Backup updated!",
			description: "Your backup configuration has been updated successfully.",
		});
	}

	if (!visible) return null;

	return (
		<div
			role="dialog"
			aria-modal="true"
			className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
			onClick={handleBackdropClick}
			onKeyDown={handleKeyDown}
			tabIndex={-1}
		>
			<Card className="w-[410px] max-w-[420px] mx-4">
				<CardHeader>
					<div className="flex items-center gap-3">
						<div className="flex-1">
							<CardTitle className="text-xl">
								{isEdit ? "Edit Backup" : "Create Backup"}
							</CardTitle>
							<CardDescription className="mt-1.5">
								{isEdit
									? "Edit your backup configuration"
									: "Create a new backup configuration"}
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div>
						<Label htmlFor="backupName" className="mb-1">
							Backup Name
						</Label>
						<Input
							id="backupName"
							placeholder="My Backup"
							value={backupName}
							onChange={(e) => setBackupName(e.target.value)}
						/>
					</div>

					<div>
						<Label htmlFor="cronSchedule" className="mb-1">
							Cron Schedule
						</Label>
						<Input
							id="cronSchedule"
							placeholder="e.g. 0 0 * * *"
							value={cronSchedule}
							onChange={(e) => setCronSchedule(e.target.value)}
						/>
					</div>
					{/* 
					<div className="flex items-center gap-2">
						<Checkbox id="isActive" checked={isActive} onChange={setIsActive} />
						<Label htmlFor="isActive" className="mb-0 cursor-pointer">
							Enable this backup
						</Label>
					</div> */}

					<div className="space-y-2">
						<div className="flex justify-between items-center">
							<Label>Files and Folders</Label>
							<div className="flex gap-2">
								<Button
									onClick={handleAddFilesOnly}
									size="sm"
									variant="outline"
								>
									<File className="mr-2 h-4 w-4" />
									Add Files
								</Button>
							</div>
						</div>
						<div className="space-y-2 min-h-[100px] max-h-[150px] overflow-auto border rounded-md p-3">
							{paths.length === 0 ? (
								<div className="flex items-center justify-center h-20">
									<p className="text-sm text-muted-foreground text-center">
										No paths added yet
									</p>
								</div>
							) : (
								paths.map((filePath) => (
									<div
										key={filePath}
										className="flex items-center justify-between p-2 bg-secondary rounded-md"
									>
										<span className="text-xs truncate flex-1" title={filePath}>
											{filePath}
										</span>
										<Button
											variant="ghost"
											size="sm"
											className="p-1 aspect-square h-6"
											onClick={() => handleRemovePath(paths.indexOf(filePath))}
										>
											<X className="h-4 w-4" />
										</Button>
									</div>
								))
							)}
						</div>
					</div>

					<div className="flex justify-end gap-3">
						<Button
							variant="outline"
							onClick={() => {
								onClose();
								resetForm();
							}}
						>
							<X className="h-4" />
							Cancel
						</Button>
						<Button
							onClick={() => {
								if (isEdit) {
									handleUpdateBackup();
								} else {
									handleAddBackup();
								}
							}}
						>
							{isEdit ? <Save className="h-4" /> : <Plus className="h-4" />}
							{isEdit ? "Save Changes" : "Create Backup"}
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
