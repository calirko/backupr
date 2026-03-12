import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import Cookies from "js-cookie";
import {
	ChevronDown,
	ChevronRight,
	Download,
	Loader2,
	PlugZap,
} from "lucide-react";
import { toast } from "sonner";
import { ClientTitle, formatBytes } from "./helpers";
import type { ClientState, GroupedBackup } from "./types";

interface Props {
	groupedBackups: GroupedBackup[];
	selectedClient: string;
	clientStates: Map<string, ClientState>;
	triggeringBackups: Set<string>;
	onBack: () => void;
	clientName: string;
	onSelectBackup: (backupName: string) => void;
	onTriggerBackup: (backupName: string) => void;
	currentStatus: string | null;
}

export default function GroupedBackupsGrid({
	groupedBackups,
	selectedClient,
	clientStates,
	triggeringBackups,
	onBack,
	onSelectBackup,
	onTriggerBackup,
	clientName,
	currentStatus,
}: Props) {
	const wsState = clientStates.get(selectedClient);

	const handleDownloadLatest = async (backup: GroupedBackup) => {
		if (!backup.latestBackup) {
			toast.error("No backup available to download");
			return;
		}

		try {
			const token = Cookies.get("token");
			if (!token) {
				toast.error("Authentication token not found");
				return;
			}

			// Create a download link and let the browser handle it natively
			const link = document.createElement("a");
			link.href = `/api/backup/${backup.latestBackup.id}/download?apiKey=${encodeURIComponent(token)}`;
			link.download = `${backup.backupName}.zip`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);

			toast.success("Download started");
		} catch (error) {
			console.error("Download error:", error);
			toast.error("Error starting download");
		}
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3 border bg-card p-3">
				<Button variant="outline" size="sm" onClick={onBack}>
					<ChevronDown className="h-4 w-4 rotate-90" />
				</Button>
				<ClientTitle connectionStatus={currentStatus} name={clientName} />
				<h2 className="font-semibold flex items-center gap-2">Backups</h2>
			</div>
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
				{groupedBackups.map((backup) => {
					const isThisRunning =
						triggeringBackups.has(backup.backupName) ||
						wsState?.activeBackup?.backupName === backup.backupName;
					const anyRunning =
						triggeringBackups.size > 0 || wsState?.activeBackup != null;
					const activeProgress =
						wsState?.activeBackup?.backupName === backup.backupName
							? wsState.activeBackup.progress
							: null;
					return (
						<Card
							key={backup.backupName}
							className={`cursor-pointer transition-colors ${
								isThisRunning ? "bg-progress" : ""
							}`}
							onClick={() => onSelectBackup(backup.backupName)}
						>
							<CardHeader>
								<div className="flex items-center justify-between">
									<div className="flex gap-1 flex-col">
										<span className="truncate font-semibold">
											{backup.backupName}
										</span>
										{backup.latestBackup && (
											<p className="text-xs text-muted-foreground">
												Last Backup:{" "}
												<span
													className={`${
														new Date(backup.latestBackup.createdAt).getTime() <
														Date.now() - 2 * 24 * 60 * 60 * 1000
															? "text-orange-300"
															: ""
													}`}
												>
													{new Date(
														backup.latestBackup.createdAt,
													).toLocaleString()}
												</span>
											</p>
										)}
									</div>
									<ChevronRight className="h-5 w-5 shrink-0" />
								</div>
							</CardHeader>
							<CardContent className="space-y-2">
								<div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
									<div className="flex flex-col">
										<span className="text-muted-foreground">
											Total Versions
										</span>
										<span className="font-semibold">{backup.totalBackups}</span>
									</div>
									<div className="flex flex-col">
										<span className="text-muted-foreground">Total Size</span>
										<span className="font-semibold">
											{formatBytes(backup.totalSize)}
										</span>
									</div>
									{/* {backup.latestBackup && (
										<div className="flex flex-col">
											<span className="text-muted-foreground">
												Last Version
											</span>
											<div className="flex items-center gap-2">
												<span className="font-semibold">
													v{backup.latestBackup.version}
												</span>
												{renderStatusBadge(backup.latestBackup.status)}
											</div>
										</div>
									)} */}
								</div>
								{/* Progress bar when this backup is actively running */}

								<div className="flex gap-2">
									{/* Backup Now button – stops card click propagation */}

									<Button
										variant="outline"
										size="sm"
										className={`mt-3 grow relative ${isThisRunning && activeProgress !== null && "bg-background"}`}
										disabled={anyRunning}
										onClick={(e) => {
											e.stopPropagation();
											onTriggerBackup(backup.backupName);
										}}
									>
										{isThisRunning && activeProgress !== null && (
											<div
												className="h-full absolute left-0 z-10 bg-card transition-all duration-300"
												style={{ width: `${activeProgress}%` }}
											/>
										)}
										{isThisRunning ? (
											<>
												<Loader2 className="h-4 w-4 mr-2 animate-spin z-20" />
												<span className="z-20">Running...</span>
											</>
										) : (
											<>
												<PlugZap className="h-4 w-4 mr-2" />
												Run Now
											</>
										)}
									</Button>
									<Button
										size="sm"
										className="mt-3"
										disabled={!backup.latestBackup || anyRunning}
										onClick={(e) => {
											e.stopPropagation();
											handleDownloadLatest(backup);
										}}
									>
										<Download className="h-4 w-4 mr-2" />
										Download latest
									</Button>
								</div>
							</CardContent>
						</Card>
					);
				})}
			</div>
		</div>
	);
}
