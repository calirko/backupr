import { Cron } from "croner";
import {
	ArrowLeftIcon,
	CheckSquareIcon,
	ClockClockwiseIcon,
	DownloadSimpleIcon,
	LightningIcon,
	MagnifyingGlassIcon,
	RowsIcon,
	SquaresFourIcon,
	XSquareIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import BackupVersionsDialog from "@/components/dialog/backup-versions";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type AgentConnectionStatus,
	ConnectionStatus,
} from "@/components/ui/connection-status";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDialog } from "@/hooks/use-dialog";
import { useSocket } from "@/hooks/use-socket";
import { BACKUP_STATUS_LABEL, BACKUP_STATUS_STYLE } from "@/lib/backup-status";

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

type SortOption = "name" | "date" | "status" | "last-backup";
type ViewMode = "grid" | "list";

const SERVER_SORT_ORDER_BY: Partial<Record<SortOption, object>> = {
	name: { name: "asc" },
	date: { created_at: "desc" },
	status: { is_active: "desc" },
};

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
	if (status.schedulerQueued) return "scheduler_queued";
	if (status.jobQueue && status.jobQueue.length > 0) return "queued";
	if (status.status === "connected") return "connected";
	return "unknown";
}

function nextCronRun(cron: string): string {
	try {
		const next = new Cron(cron).nextRun();
		return next ? next.toLocaleString() : "—";
	} catch {
		return "—";
	}
}

interface JobCardProps {
	job: BackupJob;
	agentBusy: boolean;
	liveStatusMessage: string | undefined;
	onTrigger: (id: string) => void;
	onDownloadLatest: (id: string) => void;
	onVersions: (id: string, label: string) => void;
}

function JobCard({
	job,
	agentBusy,
	liveStatusMessage,
	onTrigger,
	onDownloadLatest,
	onVersions,
}: JobCardProps) {
	const last = job.backups?.[0] ?? null;
	return (
		<Card>
			<CardHeader>
				<CardTitle className="truncate">{job.name}</CardTitle>
				<CardAction>
					{job.is_active ? (
						<CheckSquareIcon size={16} style={{ color: "var(--greenish)" }} />
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
							style={job.is_active ? { color: "var(--greenish)" } : undefined}
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
					<div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
						<span className="text-xs text-muted-foreground shrink-0">
							Next Run
						</span>
						<span className="text-xs text-right">{nextCronRun(job.cron)}</span>
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
							<span className="text-xs text-right text-muted-foreground">
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
							onClick={() => onTrigger(job.id)}
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
					onClick={() => onDownloadLatest(job.id)}
				>
					<DownloadSimpleIcon />
					Latest
				</Button>
				<Button
					size="sm"
					className="flex-1"
					onClick={() => onVersions(job.id, job.cron)}
				>
					<ClockClockwiseIcon />
					Versions
				</Button>
			</CardFooter>
		</Card>
	);
}

interface JobRowProps {
	job: BackupJob;
	agentBusy: boolean;
	liveStatusMessage: string | undefined;
	onTrigger: (id: string) => void;
	onDownloadLatest: (id: string) => void;
	onVersions: (id: string, label: string) => void;
}

function JobRow({
	job,
	agentBusy,
	liveStatusMessage,
	onTrigger,
	onDownloadLatest,
	onVersions,
}: JobRowProps) {
	const last = job.backups?.[0] ?? null;
	return (
		<div className="flex items-center gap-4 px-3 py-2.5 border bg-card dynround">
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="font-medium text-sm truncate">{job.name}</span>
					{job.is_active ? (
						<CheckSquareIcon size={13} style={{ color: "var(--greenish)" }} />
					) : (
						<XSquareIcon size={13} className="text-destructive" />
					)}
				</div>
				<span className="font-mono text-xs text-muted-foreground">
					{job.cron}
				</span>
			</div>
			<span className="text-xs text-muted-foreground shrink-0 w-16 text-right">
				{formatRelative(last?.started_at)}
			</span>
			{last && (
				<span
					className="text-xs shrink-0 w-20 text-right"
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
			)}
			{liveStatusMessage && (
				<span className="text-xs text-muted-foreground shrink-0 max-w-32 truncate">
					{liveStatusMessage}
				</span>
			)}
			<div className="flex items-center gap-1.5 shrink-0">
				<Tooltip>
					<TooltipTrigger>
						<Button
							variant="outline"
							size="sm"
							onClick={() => onTrigger(job.id)}
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
					onClick={() => onDownloadLatest(job.id)}
				>
					<DownloadSimpleIcon />
					Latest
				</Button>
				<Button size="sm" onClick={() => onVersions(job.id, job.cron)}>
					<ClockClockwiseIcon />
					Versions
				</Button>
			</div>
		</div>
	);
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
	const [total, setTotal] = useState(0);
	const [dataIsFiltered, setDataIsFiltered] = useState(false);
	const [sortBy, setSortBy] = useState<SortOption>("date");
	const [viewMode, setViewMode] = useState<ViewMode>("grid");

	async function fetchData(sort: SortOption = sortBy) {
		if (!agentId) return;
		setLoading(true);
		try {
			const serverOrderBy = SERVER_SORT_ORDER_BY[sort];
			const jobsParams = new URLSearchParams({
				filters: encodeURIComponent(JSON.stringify({ agent_id: agentId })),
			});
			if (serverOrderBy) {
				jobsParams.set(
					"orderBy",
					encodeURIComponent(JSON.stringify(serverOrderBy)),
				);
			}
			const [agentRes, jobsRes] = await Promise.all([
				fetch(`/api/agents/${agentId}`, {
					headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
				}),
				fetch(`/api/backup-jobs?${jobsParams}`, {
					headers: {
						Authorization: `Bearer ${localStorage.getItem("token")}`,
					},
				}),
			]);
			if (agentRes.ok) {
				const a = await agentRes.json();
				setAgent({ id: a.id, name: a.name });
			}
			if (jobsRes.ok) {
				const result = await jobsRes.json();
				setJobs(result.data);
				setTotal(result.absoluteTotal);
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

	const filteredJobs = appliedSearch
		? jobs.filter((j) =>
				j.name.toLowerCase().includes(appliedSearch.toLowerCase()),
			)
		: jobs;

	const visibleJobs =
		sortBy === "last-backup"
			? [...filteredJobs].sort((a, b) => {
					const at = a.backups?.[0]?.started_at
						? new Date(a.backups[0].started_at).getTime()
						: 0;
					const bt = b.backups?.[0]?.started_at
						? new Date(b.backups[0].started_at).getTime()
						: 0;
					return bt - at;
				})
			: filteredJobs;

	function applySearch() {
		setAppliedSearch(search);
		setDataIsFiltered(search !== "");
	}

	function clearSearch() {
		setSearch("");
		setAppliedSearch("");
		setDataIsFiltered(false);
	}

	useEffect(() => {
		fetchData();
	}, [agentId]);

	useEffect(() => {
		fetchData(sortBy);
	}, [sortBy]);

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
					<h1 className="text-4xl font-heading">{agent?.name ?? "—"}</h1>
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

			<div className="w-full flex justify-between">
				<div className="flex gap-2">
					<Select
						value={sortBy}
						onValueChange={(v) => setSortBy(v as SortOption)}
					>
						<SelectTrigger>
							<SelectValue placeholder="Sort by" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="name">Name</SelectItem>
							<SelectItem value="date">Date Created</SelectItem>
							<SelectItem value="status">Status</SelectItem>
							<SelectItem value="last-backup">Last Backup</SelectItem>
						</SelectContent>
					</Select>
					<div className="dark:bg-input/30 dark:hover:bg-input/50 flex gap-0.5 items-center justify-between px-0.5 border-input border dynround h-8">
						<Button
							size={"icon-xs"}
							variant={viewMode === "grid" ? "default" : "ghost"}
							onClick={() => setViewMode("grid")}
						>
							<SquaresFourIcon />
						</Button>
						<Button
							size={"icon-xs"}
							variant={viewMode === "list" ? "default" : "ghost"}
							onClick={() => setViewMode("list")}
						>
							<RowsIcon />
						</Button>
					</div>
				</div>
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

			{loading && (
				<div className="h-40 flex items-center justify-center">
					<Spinner />
				</div>
			)}
			{!loading && visibleJobs.length === 0 ? (
				<div className="h-40 w-full flex items-center justify-center">
					<p className="text-sm text-muted-foreground">
						No backup jobs configured for this agent.
					</p>
				</div>
			) : viewMode === "grid" ? (
				<div className="grid pb-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{visibleJobs.map((job) => {
						const agentStatus = agentStatuses.find(
							(s) => s.agentId === agentId,
						);
						const agentBusy =
							agentStatus?.status !== "connected" || !!agentStatus?.currentJob;
						const liveStatusMessage =
							agentStatus?.currentJob?.jobId === job.id
								? agentStatus.currentJob.statusMessage
								: undefined;
						return (
							<JobCard
								key={job.id}
								job={job}
								agentBusy={agentBusy}
								liveStatusMessage={liveStatusMessage}
								onTrigger={triggerBackup}
								onDownloadLatest={downloadLatest}
								onVersions={(id, label) =>
									openDialog(BackupVersionsDialog, {
										backupJobId: id,
										jobLabel: label,
									})
								}
							/>
						);
					})}
				</div>
			) : (
				<div className="flex flex-col gap-2 pb-6">
					{visibleJobs.map((job) => {
						const agentStatus = agentStatuses.find(
							(s) => s.agentId === agentId,
						);
						const agentBusy =
							agentStatus?.status !== "connected" || !!agentStatus?.currentJob;
						const liveStatusMessage =
							agentStatus?.currentJob?.jobId === job.id
								? agentStatus.currentJob.statusMessage
								: undefined;
						return (
							<JobRow
								key={job.id}
								job={job}
								agentBusy={agentBusy}
								liveStatusMessage={liveStatusMessage}
								onTrigger={triggerBackup}
								onDownloadLatest={downloadLatest}
								onVersions={(id, label) =>
									openDialog(BackupVersionsDialog, {
										backupJobId: id,
										jobLabel: label,
									})
								}
							/>
						);
					})}
				</div>
			)}

			{dataIsFiltered && (
				<p className="text-muted-foreground text-center text-xs">
					Showing {visibleJobs.length} of {total} agent jobs
				</p>
			)}
		</div>
	);
}
