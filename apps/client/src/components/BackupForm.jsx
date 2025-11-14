import { Database, File, Folder, X } from "lucide-react";
import { Button } from "./ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";

export function BackupForm({
	formData,
	setFormData,
	editingItem,
	onSave,
	onCancel,
}) {
	const handleAddFilesOnly = async () => {
		if (window.electron) {
			const filePaths = await window.electron.selectFilesOnly();
			if (filePaths && filePaths.length > 0) {
				setFormData((prev) => ({
					...prev,
					paths: [...prev.paths, ...filePaths],
				}));
			}
		}
	};

	const handleAddDirectories = async () => {
		if (window.electron) {
			const filePaths = await window.electron.selectDirectories();
			if (filePaths && filePaths.length > 0) {
				setFormData((prev) => ({
					...prev,
					paths: [...prev.paths, ...filePaths],
				}));
			}
		}
	};

	const handleSelectFirebirdDb = async () => {
		if (window.electron) {
			const dbPath = await window.electron.selectFirebirdDb();
			if (dbPath) {
				setFormData((prev) => ({
					...prev,
					firebirdDbPath: dbPath,
				}));
			}
		}
	};

	const handleRemovePath = (index) => {
		setFormData((prev) => ({
			...prev,
			paths: prev.paths.filter((_, i) => i !== index),
		}));
	};

	return (
		<Card className="border">
			<CardHeader>
				<CardTitle>
					{editingItem ? "Edit Sync Item" : "New Sync Item"}
				</CardTitle>
				<CardDescription>Configure what and when to backup</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="itemName">Sync Item Name</Label>
					<Input
						id="itemName"
						placeholder="e.g., My Documents, Photos, Work Files"
						value={formData.name}
						onChange={(e) =>
							setFormData((prev) => ({ ...prev, name: e.target.value }))
						}
					/>
				</div>

				<div className="space-y-2">
					<Label>Backup Type</Label>
					<div className="flex gap-4">
						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								name="backupType"
								value="normal"
								checked={formData.backupType === "normal"}
								onChange={(e) =>
									setFormData((prev) => ({
										...prev,
										backupType: e.target.value,
									}))
								}
								className="w-4 h-4"
							/>
							<File className="h-4 w-4" />
							<span>Files & Folders</span>
						</label>
						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								name="backupType"
								value="firebird"
								checked={formData.backupType === "firebird"}
								onChange={(e) =>
									setFormData((prev) => ({
										...prev,
										backupType: e.target.value,
									}))
								}
								className="w-4 h-4"
							/>
							<Database className="h-4 w-4" />
							<span>Firebird Database</span>
						</label>
					</div>
				</div>

				{formData.backupType === "normal" ? (
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
								<Button
									onClick={handleAddDirectories}
									size="sm"
									variant="outline"
								>
									<Folder className="mr-2 h-4 w-4" />
									Add Folders
								</Button>
							</div>
						</div>
						<div className="space-y-2 min-h-[100px] max-h-[200px] overflow-auto border rounded-md p-3">
							{formData.paths.length === 0 ? (
								<p className="text-sm text-muted-foreground text-center py-4">
									No paths added yet
								</p>
							) : (
								formData.paths.map((filePath) => (
									<div
										key={filePath}
										className="flex items-center justify-between p-2 bg-secondary rounded-md"
									>
										<span className="text-sm truncate flex-1" title={filePath}>
											{filePath}
										</span>
										<Button
											variant="ghost"
											size="sm"
											onClick={() =>
												handleRemovePath(formData.paths.indexOf(filePath))
											}
										>
											<X className="h-4 w-4" />
										</Button>
									</div>
								))
							)}
						</div>
					</div>
				) : (
					<div className="space-y-4">
						<div className="space-y-2">
							<div className="flex justify-between items-center">
								<Label>Firebird Database File</Label>
								<Button
									onClick={handleSelectFirebirdDb}
									size="sm"
									variant="outline"
								>
									<Database className="mr-2 h-4 w-4" />
									Select Database
								</Button>
							</div>
							{formData.firebirdDbPath ? (
								<div className="p-3 bg-secondary rounded-md">
									<p
										className="text-sm truncate"
										title={formData.firebirdDbPath}
									>
										{formData.firebirdDbPath}
									</p>
								</div>
							) : (
								<p className="text-sm text-muted-foreground text-center py-4 border rounded-md">
									No database selected
								</p>
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor="gbakPath">
								gbak Path{" "}
								<span className="text-muted-foreground text-xs">
									(optional)
								</span>
							</Label>
							<Input
								id="gbakPath"
								placeholder="Leave empty for auto-detect"
								value={formData.gbakPath}
								onChange={(e) =>
									setFormData((prev) => ({
										...prev,
										gbakPath: e.target.value,
									}))
								}
							/>
							<p className="text-xs text-muted-foreground">
								Path to gbak executable. Leave empty to auto-detect from common
								locations.
							</p>
						</div>
					</div>
				)}

				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="interval">Sync Interval</Label>
						<Select
							value={formData.interval}
							onValueChange={(value) =>
								setFormData((prev) => ({ ...prev, interval: value }))
							}
						>
							<SelectTrigger id="interval">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="manual">Manual Only</SelectItem>
								<SelectItem value="hourly">Every Hour</SelectItem>
								<SelectItem value="daily">Daily</SelectItem>
								<SelectItem value="weekly">Weekly</SelectItem>
								<SelectItem value="custom">Custom Hourly Interval</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{formData.interval === "daily" && (
						<div className="space-y-2">
							<Label htmlFor="dailyTime">Time (24h format)</Label>
							<Input
								id="dailyTime"
								type="time"
								value={formData.dailyTime}
								onChange={(e) =>
									setFormData((prev) => ({
										...prev,
										dailyTime: e.target.value,
									}))
								}
							/>
							<p className="text-xs text-muted-foreground">
								Backup will run daily at this time
							</p>
						</div>
					)}

					{formData.interval === "weekly" && (
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="weeklyDay">Day of Week</Label>
								<Select
									value={formData.weeklyDay}
									onValueChange={(value) =>
										setFormData((prev) => ({ ...prev, weeklyDay: value }))
									}
								>
									<SelectTrigger id="weeklyDay">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="0">Sunday</SelectItem>
										<SelectItem value="1">Monday</SelectItem>
										<SelectItem value="2">Tuesday</SelectItem>
										<SelectItem value="3">Wednesday</SelectItem>
										<SelectItem value="4">Thursday</SelectItem>
										<SelectItem value="5">Friday</SelectItem>
										<SelectItem value="6">Saturday</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<Label htmlFor="weeklyTime">Time (24h format)</Label>
								<Input
									id="weeklyTime"
									type="time"
									value={formData.weeklyTime}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											weeklyTime: e.target.value,
										}))
									}
								/>
							</div>
							<p className="text-xs text-muted-foreground col-span-2">
								Backup will run weekly on the selected day and time
							</p>
						</div>
					)}

					{formData.interval === "custom" && (
						<div className="space-y-2">
							<Label htmlFor="customHours">Hours Interval</Label>
							<Input
								id="customHours"
								type="number"
								min="1"
								max="168"
								placeholder="1"
								value={formData.customHours}
								onChange={(e) =>
									setFormData((prev) => ({
										...prev,
										customHours: e.target.value,
									}))
								}
							/>
							<p className="text-xs text-muted-foreground">
								Backup will run every {formData.customHours || 1} hour
								{(formData.customHours || 1) > 1 ? "s" : ""}
							</p>
						</div>
					)}
				</div>

				<div className="flex justify-end gap-2 pt-4">
					<Button variant="outline" onClick={onCancel}>
						Cancel
					</Button>
					<Button onClick={onSave}>
						{editingItem ? "Update" : "Add"} Sync Item
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
