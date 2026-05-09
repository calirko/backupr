import {
	ArrowRightIcon,
	MagnifyingGlassIcon,
	XSquareIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AgentStatus } from "@/hooks/use-socket";
import { useSocket } from "@/hooks/use-socket";
import { Spinner } from "@/components/ui/spinner";
import {
	ConnectionStatus,
	type AgentConnectionStatus,
} from "@/components/ui/connection-status";

interface Agent {
	id: string;
	name: string;
	is_active: boolean;
	total_size_bytes: number;
	created_by: { name: string } | null;
}

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
	if (status.jobQueue && status.jobQueue.length > 0) return "queued";
	if (status.status === "connected") return "connected";
	return "unknown";
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

export default function BackupsPage() {
	const [agents, setAgents] = useState<Agent[]>([]);
	const [loading, setLoading] = useState(false);
	const [search, setSearch] = useState("");
	const [appliedSearch, setAppliedSearch] = useState("");
	const { agentStatuses } = useSocket();
	const navigate = useNavigate();
	const [absoluteTotal, setAbsoluteTotal] = useState(0);

	async function fetchAgents() {
		setLoading(true);
		try {
			const response = await fetch("/api/agents", {
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

	useEffect(() => {
		fetchAgents();
	}, []);

	const visibleAgents = appliedSearch
		? agents.filter((a) =>
				a.name.toLowerCase().includes(appliedSearch.toLowerCase()),
			)
		: agents;

	function applySearch() {
		setAppliedSearch(search);
	}

	function clearSearch() {
		setSearch("");
		setAppliedSearch("");
	}

	return (
		<div className="w-full grow px-3 sm:px-14 pt-4 flex flex-col gap-6">
			<div>
				<h1 className="text-4xl font-black">Backups</h1>
				<p className="text-muted-foreground text-sm">
					Browse and download backups by agent.
				</p>
			</div>

			<div className="w-full flex justify-end">
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
			</div>

			{loading && <Spinner className="self-center" />}
			{!loading && visibleAgents.length === 0 && (
				<p className="text-sm text-muted-foreground">No agents found.</p>
			)}

			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{visibleAgents.map((agent) => {
					const status = getAgentStatus(agentStatuses, agent.id);
					return (
						<Card key={agent.id}>
							<CardHeader>
								<CardTitle className="truncate">{agent.name}</CardTitle>
								<CardAction>
									<ConnectionStatus status={status} type="long" />
								</CardAction>
							</CardHeader>
							<CardContent>
								<div className="space-y-0">
									<div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
										<span className="text-xs text-muted-foreground shrink-0">Status</span>
										<span
											className="text-xs text-right"
											style={agent.is_active ? { color: "var(--greenish)" } : undefined}
										>
											{agent.is_active ? "Active" : <span className="text-destructive">Inactive</span>}
										</span>
									</div>
									<div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
										<span className="text-xs text-muted-foreground shrink-0">Total Size</span>
										<span className="text-xs text-right font-mono">{formatBytes(agent.total_size_bytes)}</span>
									</div>
									{agent.created_by && (
										<div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
											<span className="text-xs text-muted-foreground shrink-0">Created By</span>
											<span className="text-xs text-right truncate max-w-32">{agent.created_by.name}</span>
										</div>
									)}
								</div>
							</CardContent>
							<CardFooter>
								<Button
									variant="outline"
									className="w-full"
									onClick={() => navigate(`/backups/${agent.id}/jobs`)}
								>
									<ArrowRightIcon />
									View Backups
								</Button>
							</CardFooter>
						</Card>
					);
				})}
			</div>
			{appliedSearch && (
				<div className="h-4 w-full flex items-center justify-center">
					<p className="text-xs text-muted-foreground">
						Showing {visibleAgents.length} of {absoluteTotal} agents
					</p>
				</div>
			)}
		</div>
	);
}
