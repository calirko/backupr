import {
	ClipboardIcon,
	DownloadSimpleIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSocket } from "@/hooks/use-socket";
import {
	BACKUP_STATUS_BADGE_VARIANT,
	BACKUP_STATUS_LABEL,
	type BackupStatus,
} from "@/lib/backup-status";
import Badge from "../ui/badge";

interface BackupVersion {
	id: string;
	status: BackupStatus;
	size_bytes: string | null;
	started_at: string | null;
	completed_at: string | null;
	url: string | null;
	error: string | null;
	requires_password: boolean;
}

function formatBytes(bytes: string | null | undefined): string {
	if (!bytes) return "-";
	const n = Number(bytes);
	if (n === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(n) / Math.log(1024));
	return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function StatusBadge({ status }: { status: BackupStatus }) {
	return (
		<Badge variant={BACKUP_STATUS_BADGE_VARIANT[status]}>
			{BACKUP_STATUS_LABEL[status]}
		</Badge>
	);
}

export function BackupErrorDialog({
	error,
	open,
	onClose,
}: {
	error: string;
	open: boolean;
	onClose: () => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-destructive">
						Backup Error
					</DialogTitle>
					<DialogDescription>
						This backup failed with the following error.
					</DialogDescription>
				</DialogHeader>
				<pre className="dynround border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive whitespace-pre-wrap break-all">
					{error}
				</pre>
				<DialogFooter className="gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							navigator.clipboard.writeText(error);
							toast.success("Error copied");
						}}
					>
						<ClipboardIcon />
						Copy
					</Button>
					<DialogClose asChild>
						<Button size="sm" variant={"outline"}>
							Close
						</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function BackupVersionsTable({ backupJobId }: { backupJobId: string }) {
	const [backups, setBackups] = useState<BackupVersion[]>([]);
	const [loading, setLoading] = useState(false);
	const [errorDialog, setErrorDialog] = useState<string | null>(null);
	const { agentStatuses } = useSocket();

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const params = new URLSearchParams({
				filters: encodeURIComponent(
					JSON.stringify({ backup_job_id: backupJobId }),
				),
				orderBy: encodeURIComponent(JSON.stringify({ started_at: "desc" })),
			});
			const res = await fetch(`/api/backups?${params}`, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
			});
			if (res.ok) {
				const result = await res.json();
				setBackups(result.data);
			} else {
				toast.error("Failed to load backup versions");
			}
		} catch {
			toast.error("Failed to load backup versions");
		} finally {
			setLoading(false);
		}
	}, [backupJobId]);

	useEffect(() => {
		load();
	}, [load]);

	const prevJobIdRef = useRef<string | null | undefined>(undefined);
	useEffect(() => {
		const activeJob = agentStatuses.find(
			(s) => s.currentJob?.jobId === backupJobId,
		);
		const currentJobId = activeJob?.currentJob?.id ?? null;
		if (
			prevJobIdRef.current !== undefined &&
			prevJobIdRef.current !== null &&
			currentJobId === null
		) {
			load();
		}
		prevJobIdRef.current = currentJobId;
	}, [agentStatuses, backupJobId, load]);

	if (loading) {
		return (
			<p className="text-sm text-muted-foreground py-6 text-center">
				Loading...
			</p>
		);
	}

	if (backups.length === 0) {
		return (
			<p className="text-sm text-muted-foreground py-6 text-center">
				No backups found for this job.
			</p>
		);
	}

	return (
		<>
			{errorDialog !== null && (
				<BackupErrorDialog
					error={errorDialog}
					open
					onClose={() => setErrorDialog(null)}
				/>
			)}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Started</TableHead>
						<TableHead>Finished</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Size</TableHead>
						<TableHead>Password</TableHead>
						<TableHead />
					</TableRow>
				</TableHeader>
				<TableBody>
					{backups.map((b) => {
						const liveStatus = agentStatuses
							.flatMap((a) => (a.currentJob?.id === b.id ? [a.currentJob] : []))
							.at(0)?.statusMessage;
						return (
							<TableRow key={b.id}>
								<TableCell className="text-xs">
									{b.started_at ? new Date(b.started_at).toLocaleString() : "-"}
								</TableCell>
								<TableCell className="text-xs">
									{b.completed_at
										? new Date(b.completed_at).toLocaleString()
										: "-"}
								</TableCell>
								<TableCell>
									<div className="flex flex-col gap-0.5">
										<StatusBadge status={b.status} />
										{liveStatus && (
											<span className="text-xs text-muted-foreground">
												{liveStatus}
											</span>
										)}
									</div>
								</TableCell>
								<TableCell className="text-xs text-muted-foreground">
									{formatBytes(b.size_bytes)}
								</TableCell>
								<TableCell className="text-xs">
									{b.requires_password ? (
										<span>Yes</span>
									) : (
										<span className="text-muted-foreground">No</span>
									)}
								</TableCell>
								<TableCell align="right">
									<div className="flex items-center justify-end gap-1">
										{b.status === "FAILED" ? (
											<Button
												size="sm"
												variant="destructive"
												style={{
													width: "77px",
												}}
												onClick={() =>
													setErrorDialog(
														b.error ?? "No error details available.",
													)
												}
											>
												<WarningIcon />
												Error
											</Button>
										) : (
											<>
												{b.url ? (
													<Button size="sm" variant="outline" asChild>
														<a
															href={b.url}
															target="_blank"
															rel="noreferrer"
															download
														>
															<DownloadSimpleIcon />
														</a>
													</Button>
												) : (
													<Button size="sm" variant="outline" disabled>
														<DownloadSimpleIcon />
													</Button>
												)}
												<Button
													size="sm"
													variant="outline"
													disabled={!b.url}
													onClick={() => {
														if (!b.url) return;
														navigator.clipboard.writeText(b.url);
														toast.success("Link copied");
													}}
												>
													<ClipboardIcon />
												</Button>
											</>
										)}
									</div>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</>
	);
}

export default function BackupVersionsDialog({
	open,
	onClose,
	backupJobId,
	jobLabel,
}: {
	open: boolean;
	onClose: (result?: void) => void;
	backupJobId: string;
	jobLabel?: string;
}) {
	const isMobile = useIsMobile();
	const title = jobLabel ? `Versions` : "Backup Versions";
	const description = "All recorded backup versions for this job.";

	if (isMobile) {
		return (
			<Drawer open={open} onOpenChange={() => onClose()}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>{title}</DrawerTitle>
						<DrawerDescription>{description}</DrawerDescription>
					</DrawerHeader>
					<div className="px-4 pb-4 overflow-y-auto">
						<BackupVersionsTable backupJobId={backupJobId} />
					</div>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Dialog open={open} onOpenChange={() => onClose()}>
			<DialogContent className="max-w-4xl! w-full overflow-y-auto max-h-[60vh]">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<div className="">
					<BackupVersionsTable backupJobId={backupJobId} />
				</div>
			</DialogContent>
		</Dialog>
	);
}
