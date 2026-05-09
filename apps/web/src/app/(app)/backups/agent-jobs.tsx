import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
	CardFooter,
	CardAction,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDialog } from "@/hooks/use-dialog";
import BackupVersionsDialog from "@/components/dialog/backup-versions";
import {
	ArrowLeftIcon,
	CheckSquareIcon,
	ClockClockwiseIcon,
	DownloadSimpleIcon,
	LightningIcon,
	MagnifyingGlassIcon,
	XSquareIcon,
} from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { useSocket } from "@/hooks/use-socket";
import { BACKUP_STATUS_LABEL, BACKUP_STATUS_STYLE } from "@/lib/backup-status";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	ConnectionStatus,
	type AgentConnectionStatus,
} from "@/components/ui/connection-status";

interface BackupJob {
	id: string;
	name: string;
	cron: string;
	files: string[];
	is_active: boolean;
	compression_level: number;
	use_password: boolean;
	_count: { backups: number };
	backups: Array<{
		status: string;
		started_at: string | null;
		completed_at: string | null;
	}>;
}

interface Agent {
	id: string;
	name: string;
}

function formatRelative(dateStr: string | null | undefined): string {
	if (!dateStr) return "Never";
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "Just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

function getAgentStatus(
	agentStatuses: ReturnType<typeof useSocket>["agentStatuses"],
	agentId: string,
): AgentConnectionStatus {
	const status = agentStatuses.find((s) => s.agentId === agentId);
	if (!status) return "none";
	if (status.status === "disconnected" || status.status === "inactive")
		return "disconnected";
	const isStale = Date.now() - new Date(status.lastSeen ?? 0).getTime() > 60000;
	if (isStale) return "stale";
	if (status.currentJob?.status === "running") return "running";
	if (status.jobQueue && status.jobQueue.length > 0) return "queued";
	if (status.status === "connected") return "connected";
	return "unknown";
}

export default function AgentJobsPage() {
	const { agentId } = useParams<{ agentId: string }>();
	const navigate = useNavigate();
	const { openDialog } = useDialog();
	const { send, agentStatuses } = useSocket();
	const [agent, setAgent] = useState<Agent | null>(null);
	const [jobs, setJobs] = useState<BackupJob[]>([]);
	const [loading, setLoading] = useState(false);
	const [search, setSearch] = useState("");
	const [appliedSearch, setAppliedSearch] = useState("");

	async function fetchData() {
		if (!agentId) return;
		setLoading(true);
		try {
			const [agentRes, jobsRes] = await Promise.all([
				fetch(`/api/agents/${agentId}`, {
					headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
				}),
				fetch(
					`/api/backup-jobs?filters=${encodeURIComponent(JSON.stringify({ agent_id: agentId }))}`,
					{
						headers: {
							Authorization: `Bearer ${localStorage.getItem("token")}`,
						},
					},
				),
			]);
			if (agentRes.ok) {
				const a = await agentRes.json();
				setAgent({ id: a.id, name: a.name });
			}
			if (jobsRes.ok) {
				const result = await jobsRes.json();
				setJobs(result.data);
			} else {
				const err = await jobsRes.json();
				toast.error("Failed to load jobs", { description: err.error });
			}
		} catch (error) {
			toast.error("Failed to load data", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setLoading(false);
		}
	}

	function triggerBackup(jobId: string) {
		send({ type: "trigger_backup", jobId });
		toast.info("Backup queued");
		setTimeout(() => fetchData(), 500);
	}

	async function downloadLatest(jobId: string) {
		try {
			const params = new URLSearchParams({
				filters: encodeURIComponent(JSON.stringify({ backup_job_id: jobId })),
				orderBy: encodeURIComponent(JSON.stringify({ started_at: "desc" })),
				take: "1",
			});
			const res = await fetch(`/api/backups?${params}`, {
				headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
			});
			if (res.ok) {
				const result = await res.json();
				const latest = result.data[0];
				if (latest?.url) {
					window.open(latest.url, "_blank");
				} else if (latest?.status === "IN_PROGRESS") {
					toast.error(
						"Latest backup is still in progress. Please wait for it to complete before downloading.",
					);
				} else {
					toast.error("No completed backups found for this job");
				}
			}
		} catch (error) {
			toast.error("Failed to find latest backup", {
				description: error instanceof Error ? error.message : String(error),
			});
		}
	}

	const visibleJobs = appliedSearch
		? jobs.filter((j) =>
				j.name.toLowerCase().includes(appliedSearch.toLowerCase()),
			)
		: jobs;

	function applySearch() {
		setAppliedSearch(search);
	}

	function clearSearch() {
		setSearch("");
		setAppliedSearch("");
	}

	useEffect(() => {
		fetchData();
	}, [agentId]);

	const prevJobIdRef = useRef<string | null | undefined>(undefined);
	useEffect(() => {
		const agentStatus = agentStatuses.find((s) => s.agentId === agentId);
		const currentJobId = agentStatus?.currentJob?.id ?? null;
		if (
			prevJobIdRef.current !== undefined &&
			prevJobIdRef.current !== null &&
			currentJobId === null
		) {
			fetchData();
		}
		prevJobIdRef.current = currentJobId;
	}, [agentStatuses, agentId]);

	return (
		<div className="w-full grow px-3 sm:px-14 pt-4 flex flex-col gap-6">
			<div>
				<button
					type="button"
					onClick={() => navigate("/backups")}
					className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2 transition-colors"
				>
					<ArrowLeftIcon size={14} />
					Backups
				</button>
				<div className="flex items-center gap-3">
					<h1 className="text-4xl font-black">{agent?.name ?? "—"}</h1>
					<span className="mt-0.5">
						<ConnectionStatus
							status={getAgentStatus(agentStatuses, agentId ?? "")}
							type="long"
						/>
					</span>
				</div>
				<p className="text-muted-foreground text-sm">
					Backup jobs configured for this agent.
				</p>
			</div>

			<div className="w-full flex justify-end">
				<div className="flex gap-2">
					<div className="flex items-center gap-2">
						<Input
							placeholder="Job name"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && applySearch()}
							className="w-56"
						/>
						<Button
							className="p-1! aspect-square min-w-9"
							onClick={applySearch}
						>
							<MagnifyingGlassIcon />
						</Button>
					</div>
					<Button
						variant="outline"
						className="p-1! aspect-square"
						onClick={clearSearch}
					>
						<XSquareIcon />
					</Button>
				</div>
			</div>

			{loading && <Spinner className="self-center" />}
			{!loading && visibleJobs.length === 0 && (
				<p className="text-sm text-muted-foreground">
					No backup jobs configured for this agent.
				</p>
			)}

			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{visibleJobs.map((job) => {
					const last = job.backups?.[0] ?? null;
					const agentStatus = agentStatuses.find((s) => s.agentId === agentId);
					const agentBusy =
						agentStatus?.status !== "connected" || !!agentStatus?.currentJob;
					const liveStatusMessage =
						agentStatus?.currentJob?.jobId === job.id
							? agentStatus.currentJob.statusMessage
							: undefined;
					return (
						<Card key={job.id}>
							<CardHeader>
								<CardTitle className="truncate">{job.name}</CardTitle>
								<CardAction>
									{job.is_active ? (
										<CheckSquareIcon
											size={16}
											style={{ color: "var(--greenish)" }}
										/>
									) : (
										<XSquareIcon size={16} className="text-destructive" />
									)}
								</CardAction>
								<CardDescription className="font-mono text-xs">
									{job.cron}
								</CardDescription>
							</CardHeader>

							<CardContent>
								<div className="space-y-0">
									<div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
										<span className="text-xs text-muted-foreground shrink-0">
											Status
										</span>
										<span
											className="text-xs text-right"
											style={
												job.is_active ? { color: "var(--greenish)" } : undefined
											}
										>
											{job.is_active ? (
												"Active"
											) : (
												<span className="text-destructive">Inactive</span>
											)}
										</span>
									</div>
									<div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
										<span className="text-xs text-muted-foreground shrink-0">
											Files
										</span>
										<span className="text-xs text-right">
											{job.files.length} item{job.files.length !== 1 ? "s" : ""}
										</span>
									</div>
									<div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
										<span className="text-xs text-muted-foreground shrink-0">
											Total Backups
										</span>
										<span className="text-xs text-right">
											{job._count?.backups ?? 0}
										</span>
									</div>
									<div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
										<span className="text-xs text-muted-foreground shrink-0">
											Last Run
										</span>
										<span className="text-xs text-right">
											{formatRelative(last?.started_at)}
										</span>
									</div>
									{last && (
										<div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
											<span className="text-xs text-muted-foreground shrink-0">
												Last Status
											</span>
											<span
												className="text-xs text-right"
												style={
													BACKUP_STATUS_STYLE[
														last.status as keyof typeof BACKUP_STATUS_STYLE
													] ?? {}
												}
											>
												{BACKUP_STATUS_LABEL[
													last.status as keyof typeof BACKUP_STATUS_LABEL
												] ?? last.status}
											</span>
										</div>
									)}
									{job.use_password && (
										<div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
											<span className="text-xs text-muted-foreground shrink-0">
												Encrypted
											</span>
											<span
												className="text-xs text-right"
												style={{ color: "var(--greenish)" }}
											>
												Yes
											</span>
										</div>
									)}
									{liveStatusMessage && (
										<div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
											<span className="text-xs text-muted-foreground shrink-0">
												Progress
											</span>
											<span className="text-xs text-right text-blue-200">
												{liveStatusMessage}
											</span>
										</div>
									)}
								</div>
							</CardContent>

							<CardFooter className="gap-2">
								<Tooltip>
									<TooltipTrigger>
										<Button
											variant="outline"
											size="sm"
											onClick={() => triggerBackup(job.id)}
											disabled={agentBusy || !job.is_active}
										>
											<LightningIcon />
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{!job.is_active
											? "This job is inactive"
											: agentBusy
												? "Agent is busy or offline"
												: "Trigger backup now"}
									</TooltipContent>
								</Tooltip>
								<Button
									variant="outline"
									size="sm"
									className="flex-1"
									onClick={() => downloadLatest(job.id)}
								>
									<DownloadSimpleIcon />
									Latest
								</Button>
								<Button
									size="sm"
									className="flex-1"
									onClick={() =>
										openDialog(BackupVersionsDialog, {
											backupJobId: job.id,
											jobLabel: job.cron,
										})
									}
								>
									<ClockClockwiseIcon />
									Versions
								</Button>
							</CardFooter>
						</Card>
					);
				})}
			</div>
		</div>
	);
}
