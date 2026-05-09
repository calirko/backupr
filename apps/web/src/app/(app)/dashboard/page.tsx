import { ArrowRightIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import WikiDialog from "@/components/dialog/wiki/wiki";
import { useSocket } from "@/hooks/use-socket";

interface DashboardData {
	stats: {
		total_agents: number;
		active_agents: number;
		total_jobs: number;
		total_backups: number;
		total_size_bytes: string;
		failed_last_7d: number;
	};
	last_10_backups: Array<{
		id: string;
		status: string;
		size_bytes: string | null;
		started_at: string | null;
		completed_at: string | null;
		agent_name: string;
		files: string[];
		error: string | null;
	}>;
	backups_by_day: Array<{
		day: string;
		count: number;
		size_bytes: number;
	}>;
	storage_by_job: Array<{
		id: string;
		job_name: string;
		agent_name: string;
		backup_count: number;
		size_bytes: string;
	}>;
	total_users: number;
	total_policies: number;
}

function formatBytes(bytes: string | number | null | undefined): string {
	if (bytes === null || bytes === undefined) return "—";
	const n = typeof bytes === "string" ? Number(bytes) : bytes;
	if (isNaN(n) || n === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(n) / Math.log(1024));
	return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatRelative(dateStr: string | null | undefined): string {
	if (!dateStr) return "—";
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "Just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

function getLast7Days(): string[] {
	return Array.from({ length: 7 }, (_, i) => {
		const d = new Date();
		d.setDate(d.getDate() - (6 - i));
		return d.toISOString().split("T")[0];
	});
}

function StatusDot({ status }: { status: string }) {
	const colors: Record<string, string> = {
		COMPLETED: "var(--greenish)",
		FAILED: "var(--destructive)",
		IN_PROGRESS: "var(--blueish)",
		PENDING: "var(muted-foreground)",
	};
	return (
		<span
			className={`inline-block w-2 h-2 shrink-0`}
			style={{
				backgroundColor: colors[status],
				borderRadius: "2px",
			}}
		/>
	);
}

function BackupDayChart({ data }: { data: { day: string; count: number }[] }) {
	const maxCount = Math.max(...data.map((d) => d.count), 1);

	return (
		<div className="w-full flex flex-col gap-1 h-full justify-end">
			<div className="flex gap-1.5">
				{data.map((d) => (
					<div
						key={d.day}
						className="flex-1 text-center text-xs text-muted-foreground"
					>
						{d.count > 0 ? d.count : ""}
					</div>
				))}
			</div>
			<div className="flex items-end gap-1.5 h-42">
				{data.map((d) => (
					<div
						key={d.day}
						className="flex-1 bg-primary transition-all dynround"
						style={{
							height: d.count > 0 ? `${(d.count / maxCount) * 100}%` : "2px",
							opacity: d.count > 0 ? 1 : 0.2,
						}}
					/>
				))}
			</div>
			<div className="flex gap-1.5">
				{data.map((d) => (
					<div
						key={d.day}
						className="flex-1 text-center text-xs text-muted-foreground"
					>
						{new Date(`${d.day}T12:00:00`).toLocaleDateString("en", {
							weekday: "short",
						})}
					</div>
				))}
			</div>
		</div>
	);
}

function StorageByJobChart({
	data,
	totalBytes,
}: {
	data: DashboardData["storage_by_job"];
	totalBytes: number;
}) {
	if (data.length === 0) {
		return <p className="text-sm text-muted-foreground">No backup data yet.</p>;
	}

	const top3Jobs = data
		.sort((a, b) => Number(b.size_bytes) - Number(a.size_bytes))
		.slice(0, 3);

	return (
		<div className="flex flex-col gap-3">
			{top3Jobs.map((job) => {
				const size = Number(job.size_bytes);
				const pct = totalBytes > 0 ? (size / totalBytes) * 100 : 0;
				return (
					<div key={job.id} className="flex flex-col gap-1">
						<div className="flex justify-between items-baseline text-xs">
							<span className="truncate text-foreground max-w-[55%]">
								{job.job_name}
								<span className="text-muted-foreground ml-1">
									· {job.agent_name}
								</span>
							</span>
							<span className="shrink-0 text-muted-foreground tabular-nums">
								{formatBytes(job.size_bytes)}{" "}
								<span className="text-foreground font-medium">
									{pct.toFixed(1)}%
								</span>
							</span>
						</div>
						<div className="w-full h-1.5 bg-muted overflow-hidden">
							<div
								className="h-full bg-primary transition-all duration-500"
								style={{ width: `${Math.max(pct, 0.5)}%`, borderRadius: "2px" }}
							/>
						</div>
					</div>
				);
			})}
		</div>
	);
}

export default function DashboardPage() {
	const [data, setData] = useState<DashboardData | null>(null);
	const [wikiOpen, setWikiOpen] = useState(false);
	const { agentStatuses } = useSocket();
	const navigate = useNavigate();

	async function fetchData() {
		try {
			const response = await fetch("/api/dashboard", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
			});
			const json = await response.json();
			if (response.ok) {
				setData(json);
			} else {
				toast.error("Error loading dashboard", { description: json.error });
			}
		} catch (error) {
			toast.error("Error loading dashboard", {
				description: error instanceof Error ? error.message : String(error),
			});
		}
	}

	useEffect(() => {
		fetchData();
		if (!localStorage.getItem("backupr_wiki_seen")) {
			localStorage.setItem("backupr_wiki_seen", "1");
			setWikiOpen(true);
		}
	}, []);

	const onlineCount = agentStatuses.filter(
		(s) => s.status === "connected",
	).length;

	const chartData = useMemo(() => {
		const days = getLast7Days();
		return days.map((day) => {
			const found = data?.backups_by_day.find((d) => d.day === day);
			return { day, count: found?.count ?? 0 };
		});
	}, [data?.backups_by_day]);

	const recentBackups = data?.last_10_backups?.slice(0, 6) ?? [];

	const successRate = useMemo(() => {
		const backups = data?.last_10_backups ?? [];
		if (backups.length === 0) return null;
		const completed = backups.filter((b) => b.status === "COMPLETED").length;
		return Math.round((completed / backups.length) * 100);
	}, [data?.last_10_backups]);

	const failedCount = data?.stats?.failed_last_7d ?? 0;

	const statusBreakdown = useMemo(() => {
		const backups = data?.last_10_backups ?? [];
		return (["COMPLETED", "FAILED", "IN_PROGRESS", "PENDING"] as const)
			.map((s) => ({
				status: s,
				count: backups.filter((b) => b.status === s).length,
			}))
			.filter((s) => s.count > 0);
	}, [data?.last_10_backups]);

	const totalStorageBytes = Number(data?.stats?.total_size_bytes ?? 0);

	return (
		<>
		<WikiDialog open={wikiOpen} onClose={() => setWikiOpen(false)} />
		<div className="w-full grow px-3 sm:px-14 pt-4 flex flex-col gap-6 justify-center">
			<div className="absolute top-18">
				<h1 className="text-4xl font-black">Dashboard</h1>
				<p className="text-muted-foreground text-sm">
					Overview of your agents and backup status.
				</p>
			</div>
			<div className="grid grid-cols-4 gap-4 w-full">
				{/* ── Row 1: 2 stat cards + storage-by-job chart ── */}

				<Card>
					<CardHeader>
						<CardTitle>Storage Used</CardTitle>
					</CardHeader>
					<CardContent>
						<h2 className="text-3xl font-black">
							{formatBytes(data?.stats?.total_size_bytes)}
						</h2>
						<p className="text-muted-foreground text-xs mt-0.5">
							{data?.stats?.total_backups ?? "—"} backups total
						</p>
					</CardContent>
					<CardFooter>
						<Button
							variant="outline"
							className="w-full"
							onClick={() => navigate("/backups")}
						>
							<ArrowRightIcon />
							View Backups
						</Button>
					</CardFooter>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Failed Backups</CardTitle>
					</CardHeader>
					<CardContent>
						<h2
							className={`text-3xl font-black ${failedCount > 0 ? "text-destructive" : ""}`}
						>
							{failedCount}
						</h2>
						<p className="text-muted-foreground text-xs mt-0.5">
							in the last 7 days
						</p>
					</CardContent>
					<CardFooter>
						<Button
							variant="outline"
							className="w-full"
							onClick={() => navigate("/backups")}
						>
							<ArrowRightIcon />
							View Backups
						</Button>
					</CardFooter>
				</Card>

				<Card className="col-span-2">
					<CardHeader>
						<CardTitle>Storage by Job</CardTitle>
						<CardDescription>
							Completed backup size per job · {formatBytes(totalStorageBytes)}{" "}
							total
						</CardDescription>
					</CardHeader>
					<CardContent>
						<StorageByJobChart
							data={data?.storage_by_job ?? []}
							totalBytes={totalStorageBytes}
						/>
					</CardContent>
				</Card>

				{/* ── Rows 2-3, col 1-2: Backup activity chart ── */}

				<Card className="col-span-2 row-span-2">
					<CardHeader>
						<CardTitle>Backup Activity</CardTitle>
						<CardDescription>Daily backup count · last 7 days</CardDescription>
					</CardHeader>
					<CardContent className="h-full">
						<BackupDayChart data={chartData} />
					</CardContent>
				</Card>

				{/* ── Row 2, col 3-4: Recent backups ── */}

				<Card className="col-span-2">
					<CardHeader>
						<CardTitle>Recent Backups</CardTitle>
					</CardHeader>
					<CardContent>
						{recentBackups.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No recent backups.
							</p>
						) : (
							<div className="flex flex-col gap-2.5">
								{recentBackups.map((b) => (
									<div key={b.id} className="flex items-center gap-2 text-xs">
										<StatusDot status={b.status} />
										<span className="font-medium flex-1 truncate">
											{b.agent_name}
										</span>
										<span className="text-muted-foreground shrink-0">
											{formatBytes(b.size_bytes)}
										</span>
										<span className="text-muted-foreground shrink-0 w-14 text-right">
											{formatRelative(b.started_at)}
										</span>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>

				{/* ── Row 3, col 3-4: Backup health ── */}

				<Card className="col-span-2">
					<CardHeader>
						<CardTitle>Backup Health</CardTitle>
						<CardDescription>Based on the last 10 backups</CardDescription>
					</CardHeader>
					<CardContent className="flex items-center gap-8">
						<div className="shrink-0">
							<h2
								style={{
									color:
										successRate !== null && successRate >= 80
											? "var(--greenish)"
											: successRate !== null && successRate >= 50
												? "var(--yellowish)"
												: undefined,
								}}
								className={`text-4xl font-black ${
									successRate === null && "text-muted-foreground"
								}`}
							>
								{successRate !== null ? `${successRate}%` : "—"}
							</h2>
							<p className="text-xs text-muted-foreground">success rate</p>
						</div>
						<div className="flex flex-col gap-1.5">
							{statusBreakdown.map(({ status, count }) => (
								<div key={status} className="flex items-center gap-2 text-xs">
									<StatusDot status={status} />
									<span className="text-muted-foreground capitalize">
										{status.toLowerCase().replace("_", " ")}
									</span>
									<span className="font-medium">{count}</span>
								</div>
							))}
							{statusBreakdown.length === 0 && (
								<p className="text-xs text-muted-foreground">No data yet.</p>
							)}
						</div>
					</CardContent>
				</Card>

				{/* ── Row 4: Agents, Active Jobs, Users, Policies ── */}

				<Card>
					<CardHeader>
						<CardTitle>Agents</CardTitle>
					</CardHeader>
					<CardContent>
						<h2 className="text-3xl font-black">
							{onlineCount}
							<span className="text-muted-foreground text-xl font-normal">
								/{data?.stats?.total_agents ?? "—"}
							</span>
						</h2>
						<p className="text-muted-foreground text-xs mt-0.5">
							online right now
						</p>
					</CardContent>
					<CardFooter>
						<Button
							variant="outline"
							className="w-full"
							onClick={() => navigate("/agents")}
						>
							<ArrowRightIcon />
							Manage Agents
						</Button>
					</CardFooter>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Active Jobs</CardTitle>
					</CardHeader>
					<CardContent>
						<h2 className="text-3xl font-black">
							{data?.stats?.total_jobs ?? "—"}
						</h2>
						<p className="text-muted-foreground text-xs mt-0.5">
							across all agents
						</p>
					</CardContent>
					<CardFooter>
						<Button
							variant="outline"
							className="w-full"
							onClick={() => navigate("/backup-jobs")}
						>
							<ArrowRightIcon />
							Manage Jobs
						</Button>
					</CardFooter>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Users</CardTitle>
					</CardHeader>
					<CardContent>
						<h2 className="text-3xl font-black">{data?.total_users ?? "—"}</h2>
						<p className="text-muted-foreground text-xs mt-0.5">
							with access to this server
						</p>
					</CardContent>
					<CardFooter>
						<Button
							variant="outline"
							className="w-full"
							onClick={() => navigate("/users")}
						>
							<ArrowRightIcon />
							Manage Users
						</Button>
					</CardFooter>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Policies</CardTitle>
					</CardHeader>
					<CardContent>
						<h2 className="text-3xl font-black">
							{data?.total_policies ?? "—"}
						</h2>
						<p className="text-muted-foreground text-xs mt-0.5">
							retention policies defined
						</p>
					</CardContent>
					<CardFooter>
						<Button
							variant="outline"
							className="w-full"
							onClick={() => navigate("/backup-policies")}
						>
							<ArrowRightIcon />
							Manage Policies
						</Button>
					</CardFooter>
				</Card>
			</div>
		</div>
		</>
	);
}
