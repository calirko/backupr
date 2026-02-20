import { Clock, Edit, Trash2, Upload, XCircle } from "lucide-react";
import { Button } from "./ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./ui/card";

export function BackupItemCard({ item, onEdit, onDelete, onBackup }) {
	async function handleOnBackup(item) {
		try {
			await window.backup.run(item.id);
			onBackup(item.id);
		} catch (error) {
			console.error("Backup error:", error);
		}
	}

	return (
		<Card className={item.active ? "" : "opacity-60"}>
			<CardHeader className="pb-3">
				<div className="flex justify-between items-start">
					<div className="flex-1">
						<CardTitle className="text-lg flex items-center gap-2">
							{item.name}
							{!item.active && <XCircle className="h-4 w-4" />}
						</CardTitle>
						<CardDescription className="mt-1 flex items-center">
							<Clock className="inline h-3 w-3 mr-1" />
							{item.schedule}
						</CardDescription>
					</div>
					<div className="flex gap-1">
						<Button variant="ghost" size="sm" onClick={() => onEdit(item)}>
							<Edit className="h-4 w-4" />
						</Button>
						<Button
							variant="ghost"
							className="hover:bg-destructive/10"
							size="sm"
							onClick={() => onDelete(item.id)}
						>
							<Trash2 className="h-4 w-4 text-destructive" />
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="text-sm">
					<p className="text-muted-foreground font-medium text-xs mb-1">
						Paths ({item.paths?.length || 0}):
					</p>
					<div className="space-y-1">
						{item.paths?.slice(0, 2).map((p) => (
							<p
								key={p}
								className="text-xs truncate bg-background border px-2 py-1"
								title={p}
							>
								{p}
							</p>
						))}
						{item.paths?.length > 2 && (
							<p className="text-xs text-muted-foreground">
								+{item.paths.length - 2} more...
							</p>
						)}
					</div>
				</div>

				<div className="flex justify-between items-center text-xs text-muted-foreground">
					<div>
						{item.lastBackupDate ? (
							<span>
								Last: {new Date(item.lastBackupDate).toLocaleString()}
							</span>
						) : (
							<span>Never backed up</span>
						)}
					</div>
					<div>
						{item.next ? (
							<span>Next: {new Date(item.next).toLocaleString()}</span>
						) : item.active && item.schedule ? (
							<span>Next: Calculating...</span>
						) : (
							<span>Next: Not scheduled</span>
						)}
					</div>
				</div>

				<Button
					onClick={() => handleOnBackup(item)}
					className="w-full"
					variant="outline"
				>
					<Upload className="h-4" />
					Backup Now
				</Button>
			</CardContent>
		</Card>
	);
}
