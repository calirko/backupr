import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
	Card,
	CardHeader,
	CardTitle,
	CardContent,
	CardFooter,
	CardAction,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSocket } from "@/hooks/use-socket";
import type { AgentStatus } from "@/hooks/use-socket";
import {
	ArrowRightIcon,
	MagnifyingGlassIcon,
	XSquareIcon,
} from "@phosphor-icons/react";

interface Agent {
	id: string;
	name: string;
	is_active: boolean;
}

function getAgentStatus(agentStatuses: AgentStatus[], agentId: string) {
	const status = agentStatuses.find((s) => s.agentId === agentId);
	if (!status) return { label: "Offline", color: "text-muted-foreground" };

	const lastSeen = new Date(status.lastSeen ?? 0);
	const isStale = Date.now() - lastSeen.getTime() > 60000;

	if (status.status === "disconnected" || status.status === "inactive") {
		return { label: "Offline", color: "text-destructive" };
	}
	if (isStale) return { label: "Stale", color: "text-yellow-500" };
	if (status.currentJob?.status === "running") {
		return { label: "Backup Running", color: "text-blue-200" };
	}
	if (status.status === "connected") {
		return { label: "Online", color: "text-green-200" };
	}
	return { label: "Unknown", color: "text-muted-foreground" };
}

export default function BackupsPage() {
	const [agents, setAgents] = useState<Agent[]>([]);
	const [loading, setLoading] = useState(false);
	const [search, setSearch] = useState("");
	const [appliedSearch, setAppliedSearch] = useState("");
	const { agentStatuses } = useSocket();
	const navigate = useNavigate();

	async function fetchAgents() {
		setLoading(true);
		try {
			const response = await fetch("/api/agents", {
				headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
			});
			if (response.ok) {
				const result = await response.json();
				setAgents(result.data);
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
		<div className="w-full grow px-14 pt-4 flex flex-col gap-6">
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

			{loading && (
				<p className="text-sm text-muted-foreground">Loading agents...</p>
			)}
			{!loading && visibleAgents.length === 0 && (
				<p className="text-sm text-muted-foreground">No agents found.</p>
			)}

			<div className="grid grid-cols-3 gap-4">
				{visibleAgents.map((agent) => {
					const { label, color } = getAgentStatus(agentStatuses, agent.id);
					return (
						<Card key={agent.id}>
							<CardHeader>
								<CardTitle>{agent.name}</CardTitle>
								<CardAction>
									<span className={`text-xs font-medium ${color}`}>
										{label}
									</span>
								</CardAction>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">
									{agent.is_active ? "Active" : "Inactive"}
								</p>
							</CardContent>
							<CardFooter>
								<Button
									variant={"outline"}
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
		</div>
	);
}
