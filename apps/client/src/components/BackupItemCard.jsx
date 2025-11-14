import {
	CheckCircle,
	Clock,
	Database,
	Edit,
	File,
	Pause,
	Trash2,
	Upload,
} from "lucide-react";
import { Button } from "./ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./ui/card";

export function BackupItemCard({
	item,
	onEdit,
	onDelete,
	onBackup,
	uploading,
	isGloballyPaused,
	formatNextBackup,
	getIntervalDisplay,
}) {
	return (
		<Card className={item.enabled ? "" : "opacity-60"}>
			<CardHeader className="pb-3">
				<div className="flex justify-between items-start">
					<div className="flex-1">
						<CardTitle className="text-lg flex items-center gap-2">
							{item.backupType === "firebird" ? (
								<Database className="h-4 w-4 text-orange-600" />
							) : (
								<File className="h-4 w-4 text-blue-600" />
							)}
							{item.name}
							{item.enabled && (
								<CheckCircle className="h-4 w-4 text-green-600" />
							)}
						</CardTitle>
						<CardDescription className="mt-1 flex items-center">
							<Clock className="inline h-3 w-3 mr-1" />
							{getIntervalDisplay(
								item.interval,
								item.customHours,
								item.dailyTime,
								item.weeklyDay,
								item.weeklyTime,
							)}
							{item.backupType === "firebird" && (
								<span className="ml-2 text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded">
									Firebird DB
								</span>
							)}
						</CardDescription>
					</div>
					<div className="flex gap-1">
						<Button variant="ghost" size="sm" onClick={() => onEdit(item)}>
							<Edit className="h-4 w-4" />
						</Button>
						<Button variant="ghost" size="sm" onClick={() => onDelete(item.id)}>
							<Trash2 className="h-4 w-4 text-destructive" />
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-3">
				{item.backupType === "firebird" ? (
					<div className="text-sm">
						<p className="text-muted-foreground font-medium mb-1">
							Database File:
						</p>
						<p
							className="text-xs truncate bg-secondary px-2 py-1 rounded"
							title={item.firebirdDbPath}
						>
							{item.firebirdDbPath}
						</p>
						{item.gbakPath && (
							<div className="mt-2">
								<p className="text-muted-foreground font-medium mb-1">
									gbak Path:
								</p>
								<p
									className="text-xs truncate bg-secondary px-2 py-1 rounded"
									title={item.gbakPath}
								>
									{item.gbakPath}
								</p>
							</div>
						)}
					</div>
				) : (
					<div className="text-sm">
						<p className="text-muted-foreground font-medium mb-1">
							Paths ({item.paths?.length || 0}):
						</p>
						<div className="space-y-1">
							{item.paths?.slice(0, 2).map((p) => (
								<p
									key={p}
									className="text-xs truncate bg-secondary px-2 py-1"
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
				)}

				<div className="flex justify-between items-center text-xs text-muted-foreground">
					<div>
						{item.lastBackup ? (
							<span>Last: {new Date(item.lastBackup).toLocaleString()}</span>
						) : (
							<span>Never backed up</span>
						)}
					</div>
					<div>Next: {formatNextBackup(item.nextBackup)}</div>
				</div>

				<Button
					onClick={() => onBackup(item)}
					disabled={uploading || !item.enabled || isGloballyPaused}
					className="w-full"
					size="sm"
				>
					{isGloballyPaused ? (
						<>
							<Pause className="mr-2 h-4 w-4" />
							Paused
						</>
					) : (
						<>
							<Upload className="mr-2 h-4 w-4" />
							Backup Now
						</>
					)}
				</Button>
			</CardContent>
		</Card>
	);
}
