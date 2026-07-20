import {
	ArrowRightIcon,
	ClipboardIcon,
	DownloadSimpleIcon,
	MagnifyingGlassIcon,
	RowsIcon,
	SquaresFourIcon,
	StackIcon,
	WarningIcon,
	XSquareIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AddCard, AddRow } from "@/components/add-tile";
import AgentDialog from "@/components/dialog/agent";
import { BackupErrorDialog } from "@/components/dialog/backup-versions";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
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
import { useDialog } from "@/hooks/use-dialog";
import type { AgentStatus } from "@/hooks/use-socket";
import { useSocket } from "@/hooks/use-socket";
import {
	BACKUP_STATUS_LABEL,
	BACKUP_STATUS_STYLE,
	type BackupStatus,
} from "@/lib/backup-status";

interface Agent {
	id: string;
	name: string;
	is_active: boolean;
	total_size_bytes: number;
	last_backup_at: string | null;
	created_by: { name: string } | null;
}

interface BackupRecord {
	id: string;
	status: BackupStatus;
	size_bytes: string | null;
	started_at: string | null;
	completed_at: string | null;
	url: string | null;
	error: string | null;
	requires_password: boolean;
	backup_job: {
		id: string;
		name: string;
		cron: string;
		agent: { id: string; name: string };
	};
}

type SortOption = "name" | "date" | "status" | "last-backup";
type ViewMode = "grid" | "list" | "all";

const BACKUPS_PAGE_SIZE = 50;

const SERVER_SORT_ORDER_BY: Partial<Record<SortOption, object>> = {
	name: { name: "asc" },
	date: { created_at: "desc" },
	status: { is_active: "desc" },
};

function getAgentStatus(
	agentStatuses: AgentStatus[],
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

function formatBytes(bytes: number): string {
	if (!bytes) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatBytesStr(bytes: string | null | undefined): string {
	if (!bytes) return "-";
	const n = Number(bytes);
	if (!Number.isFinite(n) || n === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(n) / Math.log(1024));
	return `${(n / 1024 ** i).toFixed(1)} ${units[i]}`;
}

interface AgentCardProps {
	agent: Agent;
	status: AgentConnectionStatus;
	onNavigate: (id: string) => void;
}

function AgentCard({ agent, status, onNavigate }: AgentCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="truncate">{agent.name}</CardTitle>
				<CardAction>
					<ConnectionStatus status={status} type="long" />
				</CardAction>
			</CardHeader>
			<CardContent>
				<div className="space-y-0">
					<div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
						<span className="text-xs text-muted-foreground shrink-0">
							Status
						</span>
						<span
							className="text-xs text-right"
							style={agent.is_active ? { color: "var(--greenish)" } : undefined}
						>
							{agent.is_active ? (
								"Active"
							) : (
								<span className="text-destructive">Inactive</span>
							)}
						</span>
					</div>
					<div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
						<span className="text-xs text-muted-foreground shrink-0">
							Total Size
						</span>
						<span className="text-xs text-right font-mono">
							{formatBytes(agent.total_size_bytes)}
						</span>
					</div>
					<div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
						<span className="text-xs text-muted-foreground shrink-0">
							Last Backup
						</span>
						<span className="text-xs text-right">
							{formatRelative(agent.last_backup_at)}
						</span>
					</div>
					{agent.created_by && (
						<div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
							<span className="text-xs text-muted-foreground shrink-0">
								Created By
							</span>
							<span className="text-xs text-right truncate max-w-32">
								{agent.created_by.name}
							</span>
						</div>
					)}
				</div>
			</CardContent>
			<CardFooter>
				<Button
					variant="outline"
					className="w-full"
					onClick={() => onNavigate(agent.id)}
				>
					<ArrowRightIcon />
					View Backups
				</Button>
			</CardFooter>
		</Card>
	);
}

interface AgentRowProps {
	agent: Agent;
	status: AgentConnectionStatus;
	onNavigate: (id: string) => void;
}

function AgentRow({ agent, status, onNavigate }: AgentRowProps) {
	return (
		<div className="flex items-center gap-4 px-3 py-2.5 border bg-card dynround transition-colors">
			<div className="flex-1 min-w-0 flex items-center gap-3">
				<span className="font-medium text-sm truncate">{agent.name}</span>
				<ConnectionStatus status={status} />
			</div>
			<span
				className="text-xs shrink-0 w-14 text-right"
				style={agent.is_active ? { color: "var(--greenish)" } : undefined}
			>
				{agent.is_active ? (
					"Active"
				) : (
					<span className="text-destructive">Inactive</span>
				)}
			</span>
			<span className="text-xs font-mono shrink-0 w-20 text-right text-muted-foreground">
				{formatBytes(agent.total_size_bytes)}
			</span>
			<span className="text-xs shrink-0 w-16 text-right text-muted-foreground">
				{formatRelative(agent.last_backup_at)}
			</span>
			{agent.created_by && (
				<span className="text-xs shrink-0 w-28 text-right text-muted-foreground truncate">
					{agent.created_by.name}
				</span>
			)}
			<Button
				variant="outline"
				size="sm"
				className="shrink-0"
				onClick={() => onNavigate(agent.id)}
			>
				<ArrowRightIcon />
				View
			</Button>
		</div>
	);
}

interface BackupRowProps {
	backup: BackupRecord;
	onError: (message: string) => void;
}

function BackupRow({ backup, onError }: BackupRowProps) {
	const { backup_job: job } = backup;
	return (
		<div className="flex items-center gap-4 px-3 py-2.5 border bg-card dynround">
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2 min-w-0">
					<span className="font-medium text-sm truncate">{job.agent.name}</span>
					<span className="text-muted-foreground text-sm shrink-0">·</span>
					<span className="text-sm text-muted-foreground truncate">
						{job.name}
					</span>
				</div>
				<span className="font-mono text-xs text-muted-foreground">
					{job.cron}
				</span>
			</div>
			<span className="text-xs text-muted-foreground shrink-0 w-36 text-right">
				{backup.started_at ? new Date(backup.started_at).toLocaleString() : "-"}
			</span>
			<span
				className="text-xs shrink-0 w-20 text-right"
				style={BACKUP_STATUS_STYLE[backup.status] ?? {}}
			>
				{BACKUP_STATUS_LABEL[backup.status] ?? backup.status}
			</span>
			<span className="text-xs font-mono shrink-0 w-20 text-right text-muted-foreground">
				{formatBytesStr(backup.size_bytes)}
			</span>
			<div className="flex items-center gap-1.5 shrink-0">
				{backup.status === "FAILED" ? (
					<Button
						variant="destructive"
						size="sm"
						onClick={() =>
							onError(backup.error ?? "No error details available.")
						}
					>
						<WarningIcon />
						Error
					</Button>
				) : (
					<>
						{backup.url ? (
							<Button variant="outline" size="sm" asChild>
								<a href={backup.url} target="_blank" rel="noreferrer" download>
									<DownloadSimpleIcon />
								</a>
							</Button>
						) : (
							<Button variant="outline" size="sm" disabled>
								<DownloadSimpleIcon />
							</Button>
						)}
						<Button
							variant="outline"
							size="sm"
							disabled={!backup.url}
							onClick={() => {
								if (!backup.url) return;
								navigator.clipboard.writeText(backup.url);
								toast.success("Link copied");
							}}
						>
							<ClipboardIcon />
						</Button>
					</>
				)}
			</div>
		</div>
	);
}

export default function BackupsPage() {
	const [agents, setAgents] = useState<Agent[]>([]);
	const [loading, setLoading] = useState(false);
	const [search, setSearch] = useState("");
	const [appliedSearch, setAppliedSearch] = useState("");
	const [sortBy, setSortBy] = useState<SortOption>("date");
	const [viewMode, setViewMode] = useState<ViewMode>("grid");
	const { agentStatuses } = useSocket();
	const { openDialog } = useDialog();
	const navigate = useNavigate();
	const [absoluteTotal, setAbsoluteTotal] = useState(0);

	const [backups, setBackups] = useState<BackupRecord[]>([]);
	const [backupsTotal, setBackupsTotal] = useState(0);
	const [backupsLoading, setBackupsLoading] = useState(false);
	const [errorDialog, setErrorDialog] = useState<string | null>(null);

	async function fetchAgents(sort: SortOption = sortBy) {
		setLoading(true);
		try {
			const serverOrderBy = SERVER_SORT_ORDER_BY[sort];
			const params = new URLSearchParams();
			if (serverOrderBy) {
				params.set(
					"orderBy",
					encodeURIComponent(JSON.stringify(serverOrderBy)),
				);
			}
			const response = await fetch(`/api/agents?${params}`, {
				headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
			});
			if (response.ok) {
				const result = await response.json();
				setAgents(result.data);
				setAbsoluteTotal(result.absoluteTotal);
			} else {
				const err = await response.json();
				toast.error("Failed to load agents", { description: err.error });
			}
		} catch (error) {
			toast.error("Failed to load agents", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setLoading(false);
		}
	}

	async function fetchBackups(reset: boolean) {
		setBackupsLoading(true);
		try {
			const skip = reset ? 0 : backups.length;
			const params = new URLSearchParams({
				orderBy: encodeURIComponent(JSON.stringify({ started_at: "desc" })),
				skip: String(skip),
				take: String(BACKUPS_PAGE_SIZE),
			});
			const response = await fetch(`/api/backups?${params}`, {
				headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
			});
			if (response.ok) {
				const result = await response.json();
				setBackups((prev) => (reset ? result.data : [...prev, ...result.data]));
				setBackupsTotal(result.absoluteTotal);
			} else {
				const err = await response.json();
				toast.error("Failed to load backups", { description: err.error });
			}
		} catch (error) {
			toast.error("Failed to load backups", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setBackupsLoading(false);
		}
	}

	useEffect(() => {
		fetchAgents();
	}, []);

	useEffect(() => {
		if (viewMode === "all") return;
		fetchAgents(sortBy);
	}, [sortBy]);

	useEffect(() => {
		if (viewMode === "all") fetchBackups(true);
	}, [viewMode]);

	const filteredAgents = appliedSearch
		? agents.filter((a) =>
				a.name.toLowerCase().includes(appliedSearch.toLowerCase()),
			)
		: agents;

	const visibleAgents =
		sortBy === "last-backup"
			? [...filteredAgents].sort((a, b) => {
					const at = a.last_backup_at
						? new Date(a.last_backup_at).getTime()
						: 0;
					const bt = b.last_backup_at
						? new Date(b.last_backup_at).getTime()
						: 0;
					return bt - at;
				})
			: filteredAgents;

	function applySearch() {
		setAppliedSearch(search);
	}

	function clearSearch() {
		setSearch("");
		setAppliedSearch("");
	}

	function addAgent() {
		openDialog(AgentDialog, {
			onConfirm: (agent) => {
				fetchAgents();
				if (agent) navigate(`/backups/${agent.id}/jobs`);
			},
		});
	}

	return (
		<div className="w-full grow px-3 sm:px-14 pt-4 flex flex-col gap-6">
			<div>
				<h1 className="text-4xl font-heading">Backups</h1>
				<p className="text-muted-foreground text-sm">
					Browse and download backups by agent.
				</p>
			</div>

			<div className="w-full flex justify-between">
				<div className="flex gap-2">
					{viewMode !== "all" && (
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
					)}
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
						<Button
							size={"icon-xs"}
							variant={viewMode === "all" ? "default" : "ghost"}
							onClick={() => setViewMode("all")}
						>
							<StackIcon />
						</Button>
					</div>
				</div>
				{viewMode !== "all" && (
					<div className="flex gap-2">
						<div className="flex items-center gap-2">
							<Input
								placeholder="Agent name"
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
				)}
			</div>

			{viewMode === "all" ? (
				<>
					{backupsLoading && backups.length === 0 && (
						<Spinner className="self-center" />
					)}
					{!backupsLoading && backups.length === 0 && (
						<p className="text-sm text-muted-foreground">No backups found.</p>
					)}
					<div className="flex flex-col gap-2">
						{backups.map((backup) => (
							<BackupRow
								key={backup.id}
								backup={backup}
								onError={(message) => setErrorDialog(message)}
							/>
						))}
					</div>
					{backups.length < backupsTotal && (
						<div className="flex justify-center">
							<Button
								variant="outline"
								onClick={() => fetchBackups(false)}
								disabled={backupsLoading}
							>
								{backupsLoading ? <Spinner /> : "Load more"}
							</Button>
						</div>
					)}
					{backups.length > 0 && (
						<div className="h-4 w-full flex items-center justify-center">
							<p className="text-xs text-muted-foreground">
								Showing {backups.length} of {backupsTotal} backups
							</p>
						</div>
					)}
					{errorDialog !== null && (
						<BackupErrorDialog
							error={errorDialog}
							open
							onClose={() => setErrorDialog(null)}
						/>
					)}
				</>
			) : (
				<>
					{loading && <Spinner className="self-center" />}

					{viewMode === "grid" ? (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							<AddCard label="Add Agent" onClick={addAgent} />
							{visibleAgents.map((agent) => (
								<AgentCard
									key={agent.id}
									agent={agent}
									status={getAgentStatus(agentStatuses, agent.id)}
									onNavigate={(id) => navigate(`/backups/${id}/jobs`)}
								/>
							))}
						</div>
					) : (
						<div className="flex flex-col gap-2">
							<AddRow label="Add Agent" onClick={addAgent} />
							{visibleAgents.map((agent) => (
								<AgentRow
									key={agent.id}
									agent={agent}
									status={getAgentStatus(agentStatuses, agent.id)}
									onNavigate={(id) => navigate(`/backups/${id}/jobs`)}
								/>
							))}
						</div>
					)}

					{appliedSearch && (
						<div className="h-4 w-full flex items-center justify-center">
							<p className="text-xs text-muted-foreground">
								Showing {visibleAgents.length} of {absoluteTotal} agents
							</p>
						</div>
					)}
				</>
			)}
		</div>
	);
}
