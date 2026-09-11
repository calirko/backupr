import { WarningIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
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
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
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
import { BackupErrorDialog } from "./backup-versions";

interface FailedBackup {
	id: string;
	started_at: string | null;
	completed_at: string | null;
	error: string | null;
	backup_job: {
		id: string;
		name: string;
		agent: { id: string; name: string };
	};
}

function formatDateTime(dateStr: string | null): string {
	if (!dateStr) return "-";
	return new Date(dateStr).toLocaleString();
}

function summarizeError(error: string | null): string {
	if (!error) return "No error details available.";
	const firstLine = error.split("\n")[0];
	return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
}

function FailedBackupsTable({ open }: { open: boolean }) {
	const [backups, setBackups] = useState<FailedBackup[]>([]);
	const [loading, setLoading] = useState(false);
	const [errorDialog, setErrorDialog] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const sevenDaysAgo = new Date(
				Date.now() - 7 * 24 * 60 * 60 * 1000,
			).toISOString();
			const params = new URLSearchParams({
				filters: encodeURIComponent(
					JSON.stringify({
						status: "FAILED",
						started_at: { gte: sevenDaysAgo },
					}),
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
				toast.error("Failed to load failed backups");
			}
		} catch {
			toast.error("Failed to load failed backups");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (open) load();
	}, [open, load]);

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
				No failed backups in the last 7 days.
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
						<TableHead>Job</TableHead>
						<TableHead>Agent</TableHead>
						<TableHead>Error</TableHead>
						<TableHead />
					</TableRow>
				</TableHeader>
				<TableBody>
					{backups.map((b) => (
						<TableRow key={b.id}>
							<TableCell className="text-xs text-muted-foreground whitespace-nowrap">
								{formatDateTime(b.started_at)}
							</TableCell>
							<TableCell className="text-xs font-medium">
								{b.backup_job.name}
							</TableCell>
							<TableCell className="text-xs text-muted-foreground">
								{b.backup_job.agent.name}
							</TableCell>
							<TableCell className="text-xs text-destructive truncate max-w-0 w-full">
								{summarizeError(b.error)}
							</TableCell>
							<TableCell align="right">
								<div className="flex items-center justify-end gap-1">
									<Button
										size="sm"
										variant="destructive"
										onClick={() =>
											setErrorDialog(b.error ?? "No error details available.")
										}
									>
										<WarningIcon />
										Error
									</Button>
								</div>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</>
	);
}

export default function FailedBackupsDialog({
	open,
	onClose,
}: {
	open: boolean;
	onClose: (result?: void) => void;
}) {
	const isMobile = useIsMobile();
	const title = "Failed Backups";
	const description = "All backup runs that failed in the last 7 days.";

	if (isMobile) {
		return (
			<Drawer open={open} onOpenChange={() => onClose()}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>{title}</DrawerTitle>
						<DrawerDescription>{description}</DrawerDescription>
					</DrawerHeader>
					<div className="px-4 pb-4 overflow-y-auto">
						<FailedBackupsTable open={open} />
					</div>
					<DrawerFooter>
						<DrawerClose asChild>
							<Button variant="outline">Close</Button>
						</DrawerClose>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Dialog open={open} onOpenChange={() => onClose()}>
			<DialogContent className="max-w-4xl! w-full overflow-y-auto max-h-[70vh]">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<FailedBackupsTable open={open} />
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline">Close</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
