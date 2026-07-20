import {
	ArrowRightIcon,
	DesktopIcon,
	HardDrivesIcon,
	ShieldCheckIcon,
	StackIcon,
	UsersIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { toast } from "sonner";
import WikiDialog from "@/components/dialog/wiki/wiki";
import Badge from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useSocket } from "@/hooks/use-socket";
import {
	BACKUP_STATUS_BADGE_VARIANT,
	BACKUP_STATUS_LABEL,
} from "@/lib/backup-status";

interface DashboardData {
	stats: {
		total_agents: number;
		active_agents: number;
		total_jobs: number;
		total_backups: number;
		total_size_bytes: string;
		free_size_bytes: string | null;
		total_objects: number;
		failed_last_7d: number;
	};
	last_10_backups: Array<{
		id: string;
		status: string;
		size_bytes: string | null;
		started_at: string | null;
		completed_at: string | null;
		agent_name: string;
		job_name: string;
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
	if (bytes === null || bytes === undefined) return "-";
	const n = typeof bytes === "string" ? Number(bytes) : bytes;
	if (isNaN(n) || n === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(n) / Math.log(1024));
	return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatRelative(dateStr: string | null | undefined): string {
	if (!dateStr) return "-";
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
		const year = d.getFullYear();
		const month = String(d.getMonth() + 1).padStart(2, "0");
		const day = String(d.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	});
}

const backupDayChartConfig = {
	count: {
		label: "Backups",
		color: "var(--primary)",
	},
} satisfies ChartConfig;

function BackupDayChart({ data }: { data: { day: string; count: number }[] }) {
	return (
		<ChartContainer
			config={backupDayChartConfig}
			className="h-full w-full min-h-[200px]"
		>
			<AreaChart accessibilityLayer data={data}>
				<defs>
					<linearGradient id="fillCount" x1="0" y1="0" x2="0" y2="1">
						<stop
							offset="5%"
							stopColor="var(--color-count)"
							stopOpacity={0.4}
						/>
						<stop
							offset="95%"
							stopColor="var(--color-count)"
							stopOpacity={0.05}
						/>
					</linearGradient>
				</defs>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="day"
					tickLine={false}
					axisLine={false}
					tickMargin={10}
					tickFormatter={(value) =>
						new Date(`${value}T12:00:00`).toLocaleDateString("en", {
							weekday: "short",
						})
					}
				/>
				<ChartTooltip
					cursor={false}
					content={
						<ChartTooltipContent
							indicator="dot"
							labelFormatter={(_, payload) =>
								new Date(
									`${payload[0]?.payload.day}T12:00:00`,
								).toLocaleDateString("en", {
									weekday: "long",
									month: "short",
									day: "numeric",
								})
							}
						/>
					}
				/>
				<Area
					dataKey="count"
					type="natural"
					fill="url(#fillCount)"
					stroke="var(--color-count)"
					strokeWidth={2}
				/>
			</AreaChart>
		</ChartContainer>
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
	const { agentStatuses, backupUpdateCount } = useSocket();
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

	useEffect(() => {
		if (backupUpdateCount > 0) fetchData();
	}, [backupUpdateCount]);

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
			<div className="w-full grow px-3 sm:px-14 pt-4 flex flex-col gap-6">
				<div>
					<h1 className="text-4xl font-heading">Dashboard</h1>
					<p className="text-muted-foreground text-sm">
						Overview of your agents and backup status.
					</p>
				</div>
				<div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
					{/* ── Row 1: 2 stat cards + storage-by-job chart ── */}

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-1.5">
								<HardDrivesIcon size={16} className="text-muted-foreground" />
								Storage Used
							</CardTitle>
						</CardHeader>
						<CardContent>
							<h2 className="text-3xl font-heading">
								{formatBytes(data?.stats?.total_size_bytes)}
								{data?.stats?.free_size_bytes && (
									<span className="text-muted-foreground text-xl font-normal">
										/{formatBytes(data?.stats?.free_size_bytes)}
									</span>
								)}
							</h2>
							<p className="text-muted-foreground text-xs mt-0.5">
								{data?.stats?.free_size_bytes
									? "free available"
									: `${data?.stats?.total_objects ?? "-"} objects in MinIO`}
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
							<CardTitle className="flex items-center gap-1.5">
								<WarningIcon
									size={16}
									className={
										failedCount > 0
											? "text-destructive"
											: "text-muted-foreground"
									}
								/>
								Failed Backups
							</CardTitle>
						</CardHeader>
						<CardContent>
							<h2
								className={`text-3xl font-heading ${failedCount > 0 ? "text-destructive" : ""}`}
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
							<CardDescription>
								Daily backup count · last 7 days
							</CardDescription>
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
								<Table>
									<TableBody>
										{recentBackups.map((b) => (
											<TableRow key={b.id} className="text-xs">
												<TableCell className="p-1.5 pl-0">
													<Badge
														variant={
															BACKUP_STATUS_BADGE_VARIANT[
																b.status as keyof typeof BACKUP_STATUS_BADGE_VARIANT
															] ?? "default"
														}
													>
														{BACKUP_STATUS_LABEL[
															b.status as keyof typeof BACKUP_STATUS_LABEL
														] ?? b.status}
													</Badge>
												</TableCell>
												<TableCell className="p-1.5 font-medium truncate max-w-0 w-full">
													{b.job_name}
													<span className="text-muted-foreground font-normal">
														{" "}
														· {b.agent_name}
													</span>
												</TableCell>
												<TableCell className="p-1.5 text-muted-foreground text-right">
													{formatBytes(b.size_bytes)}
												</TableCell>
												<TableCell className="p-1.5 pr-0 text-muted-foreground text-right w-14">
													{formatRelative(b.started_at)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
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
									className={`text-4xl font-heading ${
										successRate === null && "text-muted-foreground"
									}`}
								>
									{successRate !== null ? `${successRate}%` : "-"}
								</h2>
								<p className="text-xs text-muted-foreground">success rate</p>
							</div>
							<div className="flex flex-col gap-1.5">
								{statusBreakdown.map(({ status, count }) => (
									<div key={status} className="flex items-center gap-2 text-xs">
										<Badge
											variant={
												BACKUP_STATUS_BADGE_VARIANT[
													status as keyof typeof BACKUP_STATUS_BADGE_VARIANT
												]
											}
										>
											{
												BACKUP_STATUS_LABEL[
													status as keyof typeof BACKUP_STATUS_LABEL
												]
											}
										</Badge>
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

					<Card className="col-span-2 md:col-span-4">
						<CardHeader>
							<CardTitle>Overview</CardTitle>
							<CardDescription>
								Quick counts across your account
							</CardDescription>
						</CardHeader>
						<CardContent className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border/50">
							{[
								{
									icon: DesktopIcon,
									label: "Agents",
									value: onlineCount,
									suffix: `/${data?.stats?.total_agents ?? "-"}`,
									detail: "online now",
									href: "/agents",
								},
								{
									icon: StackIcon,
									label: "Active Jobs",
									value: data?.stats?.total_jobs ?? "-",
									detail: "across all agents",
									href: "/backup-jobs",
								},
								{
									icon: UsersIcon,
									label: "Users",
									value: data?.total_users ?? "-",
									detail: "with access",
									href: "/users",
								},
								{
									icon: ShieldCheckIcon,
									label: "Policies",
									value: data?.total_policies ?? "-",
									detail: "retention rules",
									href: "/backup-policies",
								},
							].map((stat) => (
								<button
									key={stat.label}
									type="button"
									onClick={() => navigate(stat.href)}
									className="group flex items-center justify-between gap-2 py-3 first:pt-0 last:pb-0 md:py-0 md:px-4 md:first:pl-0 md:last:pr-0 text-left cursor-pointer"
								>
									<div className="flex flex-col gap-1">
										<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
											<stat.icon size={14} />
											{stat.label}
										</div>
										<div className="flex items-baseline gap-1">
											<h2 className="text-2xl font-heading">{stat.value}</h2>
											{stat.suffix && (
												<span className="text-muted-foreground text-sm">
													{stat.suffix}
												</span>
											)}
										</div>
										<p className="text-muted-foreground text-xs">
											{stat.detail}
										</p>
									</div>
									<ArrowRightIcon
										className="shrink-0 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0"
										size={16}
									/>
								</button>
							))}
						</CardContent>
					</Card>
				</div>
			</div>
		</>
	);
}
