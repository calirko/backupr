import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { Button } from "@/components/ui/button";
import {
	CheckSquareIcon,
	WarningIcon,
	XSquareIcon,
	Info,
} from "@phosphor-icons/react";
import { ConnectionStatus } from "@/components/ui/connection-status";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

interface PathResult {
	path: string;
	exists: boolean;
	readable: boolean;
	type: "file" | "directory" | "unknown";
	size_bytes: number;
	error?: string;
}

interface TestJobResult {
	date_triggered: string;
	time_elapsed_ms: number;
	storage_required: number | null;
	files_found: boolean;
	file_count: number;
	files: string[];
	agent_online: boolean;
	critical_info: string[];
	path_results?: PathResult[];
}

function formatBytes(bytes: number | null): string {
	if (bytes === null) return "—";
	if (bytes === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
			<span className="text-xs text-muted-foreground shrink-0">{label}</span>
			<span className="text-xs text-right">{value}</span>
		</div>
	);
}

function TestJobContent({ jobId }: { jobId: string }) {
	const [result, setResult] = useState<TestJobResult | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		async function run() {
			setLoading(true);
			try {
				const res = await fetch(`/api/backup-jobs/${jobId}/test`, {
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`,
					},
				});
				if (res.ok) {
					setResult(await res.json());
				} else {
					const err = await res.json();
					toast.error("Test failed", { description: err.error });
				}
			} catch (e) {
				toast.error("Test failed", {
					description: e instanceof Error ? e.message : String(e),
				});
			} finally {
				setLoading(false);
			}
		}
		run();
	}, [jobId]);

	if (loading) {
		return (
			<p className="text-sm text-muted-foreground py-6 text-center">
				Running test...
			</p>
		);
	}

	if (!result) {
		return (
			<p className="text-sm text-destructive py-6 text-center">
				Failed to load test results.
			</p>
		);
	}

	return (
		<TooltipProvider>
			<div className="space-y-4">
				<div className="space-y-0">
					<InfoRow
						label="Date Triggered"
						value={new Date(result.date_triggered).toLocaleString()}
					/>
					<InfoRow
						label="Time Elapsed"
						value={`${result.time_elapsed_ms} ms`}
					/>
					<div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50">
						<div className="flex items-center gap-1.5 shrink-0">
							<span className="text-xs text-muted-foreground">
								Storage Required
							</span>
							<Tooltip>
								<TooltipTrigger asChild>
									<button className="inline-flex items-center justify-center">
										<Info className="size-3.5 text-muted-foreground hover:text-foreground transition-colors" />
									</button>
								</TooltipTrigger>
								<TooltipContent side="right" className="text-xs max-w-xs">
									Original files + temp copy + compressed archive (all exist on
									disk simultaneously)
								</TooltipContent>
							</Tooltip>
						</div>
						<span className="text-xs text-right">
							{formatBytes(result.storage_required)}
						</span>
					</div>
					<InfoRow
						label="Files / Directories"
						value={
							result.files_found ? (
								<span className="flex items-center gap-1 justify-end">
									<CheckSquareIcon
										className="size-3.5"
										style={{ color: "var(--greenish)" }}
									/>
									{result.file_count} configured
								</span>
							) : (
								<span className="flex items-center gap-1 justify-end text-destructive">
									<XSquareIcon className="size-3.5" />
									None configured
								</span>
							)
						}
					/>
					<InfoRow
						label="Agent Status"
						value={
							<ConnectionStatus
								status={result.agent_online ? "connected" : "disconnected"}
							/>
						}
					/>
				</div>

				{(
					result.path_results ??
					result.files.map((f) => ({
						path: f,
						exists: true,
						readable: true,
						type: "unknown" as const,
						size_bytes: 0,
					}))
				).length > 0 && (
					<div>
						<p className="text-xs text-muted-foreground mb-1.5">
							Configured paths
						</p>
						<ul className="space-y-1">
							{(
								result.path_results ??
								result.files.map((f) => ({
									path: f,
									exists: true,
									readable: true,
									type: "unknown" as const,
									size_bytes: 0,
									error: undefined,
								}))
							).map((pr) => (
								<li
									key={pr.path}
									className={`dynround text-xs font-mono px-2 py-1.5 ${pr.exists && pr.readable ? "bg-muted" : "bg-destructive/10 border border-destructive/20"}`}
								>
									<div className="flex items-center justify-between gap-2">
										<span
											className={
												pr.exists && pr.readable ? "" : "text-destructive"
											}
										>
											{pr.path}
										</span>
										{pr.exists && pr.readable && pr.size_bytes > 0 && (
											<span className="text-muted-foreground shrink-0">
												{formatBytes(pr.size_bytes)}
											</span>
										)}
										{(!pr.exists || !pr.readable) && (
											<XSquareIcon className="size-3.5 text-destructive shrink-0" />
										)}
									</div>
									{pr.error && (
										<p className="text-destructive mt-0.5 font-sans">
											{pr.error}
										</p>
									)}
								</li>
							))}
						</ul>
					</div>
				)}

				{result.critical_info.length > 0 && (
					<div className="space-y-1.5">
						{result.critical_info.map((msg) => (
							<div
								key={msg}
								className="dynround flex items-start gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2"
							>
								<WarningIcon className="size-3.5 mt-0.5 shrink-0" />
								{msg}
							</div>
						))}
					</div>
				)}
			</div>
		</TooltipProvider>
	);
}

export default function TestJobDialog({
	open,
	onClose,
	jobId,
	jobName,
}: {
	open: boolean;
	onClose: (result?: void) => void;
	jobId: string;
	jobName?: string;
}) {
	const isMobile = useIsMobile();
	const title = "Test Job";
	const description = jobName
		? `Dry-run check for "${jobName}".`
		: "Dry-run check for this backup job.";

	const footer = (CloseComponent: typeof DialogClose | typeof DrawerClose) => (
		<CloseComponent asChild>
			<Button variant="outline">
				<XSquareIcon />
				Close
			</Button>
		</CloseComponent>
	);

	if (isMobile) {
		return (
			<Drawer open={open} onOpenChange={() => onClose()}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>{title}</DrawerTitle>
						<DrawerDescription>{description}</DrawerDescription>
					</DrawerHeader>
					<div className="px-4 pb-2">
						<TestJobContent jobId={jobId} />
					</div>
					<DrawerFooter>{footer(DrawerClose)}</DrawerFooter>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Dialog open={open} onOpenChange={() => onClose()}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<TestJobContent jobId={jobId} />
				<DialogFooter>{footer(DialogClose)}</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
