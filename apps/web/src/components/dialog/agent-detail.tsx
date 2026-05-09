import { Button } from "../ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "../ui/drawer";
import { XSquareIcon, CheckSquareIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Label } from "../ui/label";
import { useSocket } from "@/hooks/use-socket";
import {
	ConnectionStatus,
	type AgentConnectionStatus,
} from "../ui/connection-status";

interface AgentSession {
	id: string;
	token: string;
	created_at: string;
	last_seen_at: string;
	info: Record<string, any>;
}

interface AgentCode {
	id: string;
	code: string;
	created_at: string;
	expires_at: string | null;
}

interface BackupJob {
	id: string;
	name?: string;
	is_active: boolean;
	cron: string;
}

interface AgentDetailData {
	id: string;
	name: string;
	is_active: boolean;
	created_at: string;
	updated_at: string;
	agentSessions: AgentSession[];
	agentCodes: AgentCode[];
	backupJobs: BackupJob[];
}

export default function AgentDetailDialog({
	open,
	onClose,
	agentId,
}: {
	open: boolean;
	agentId: string;
	onClose: (result: boolean) => void;
}): React.JSX.Element {
	const isMobile = useIsMobile();
	const { agentStatuses } = useSocket();
	const [data, setData] = useState<AgentDetailData | null>(null);
	const [loading, setLoading] = useState(false);

	function resolveConnectionStatus(): AgentConnectionStatus {
		const status = agentStatuses.find((s) => s.agentId === agentId);
		if (!status) return "none";
		if (status.status === "disconnected" || status.status === "inactive")
			return "disconnected";
		const isStale =
			Date.now() - new Date(status.lastSeen || 0).getTime() > 60000;
		if (isStale) return "stale";
		if (status.currentJob?.status === "running") return "running";
		if (status.jobQueue && status.jobQueue.length > 0) return "queued";
		if (status.status === "connected") return "connected";
		return "unknown";
	}

	const connectionStatus = resolveConnectionStatus();

	useEffect(() => {
		if (open && agentId) {
			fetchAgentDetails();
		}
	}, [open, agentId]);

	async function fetchAgentDetails() {
		setLoading(true);
		try {
			const response = await fetch(`/api/agents/${agentId}`, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
			});
			if (response.ok) {
				const result = await response.json();
				setData(result);
			} else {
				const error = await response.json();
				toast.error("Error fetching agent details", {
					description:
						error instanceof Error ? error.message : String(error.error),
				});
			}
		} catch (error) {
			console.error(error);
			toast.error("Failed to fetch agent details", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setLoading(false);
		}
	}

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleString();
	};

	const formatSystemInfo = (info: Record<string, any>) => {
		return {
			arch: info.arch || "N/A",
			cpus: info.cpus || "N/A",
			platform: info.platform || "N/A",
			hostname: info.hostname || "N/A",
			release: info.release || "N/A",
			version: info.agent_version || "N/A",
		};
	};

	const content = (
		<div className="space-y-6">
			{/* Agent Status */}
			<div className="space-y-2">
				<div className="grid grid-cols-2 gap-4 text-sm">
					<div className="space-y-2">
						<Label className="text-muted-foreground">Name</Label>
						<p className="font-medium">{data?.name}</p>
					</div>
					<div className="space-y-2">
						<Label className="text-muted-foreground">Status</Label>
						<p className="font-medium">
							{data?.is_active ? (
								<span
									className="flex items-center gap-1"
									style={{ color: "var(--greenish)" }}
								>
									<CheckSquareIcon size={16} />
									Active
								</span>
							) : (
								<span className="text-destructive flex items-center gap-1">
									<XSquareIcon size={16} />
									Inactive
								</span>
							)}
						</p>
					</div>
					<div className="space-y-2">
						<Label className="text-muted-foreground">Created</Label>
						<p className="font-medium text-xs">
							{data && formatDate(data.created_at)}
						</p>
					</div>
					<div className="space-y-2">
						<Label className="text-muted-foreground">Last Update</Label>
						<p className="font-medium text-xs">
							{data && formatDate(data.updated_at)}
						</p>
					</div>
				</div>
			</div>

			{/* Active Sessions */}
			<div className="space-y-2">
				<h3 className="font-semibold text-sm flex items-center gap-2">
					Active Sessions ({data?.agentSessions.length || 0})
				</h3>
				{data && data.agentSessions.length > 0 ? (
					<div className="space-y-3">
						{data.agentSessions.map((session) => {
							const sysInfo = formatSystemInfo(session.info);
							return (
								<div
									key={session.id}
									className="border rounded-lg p-3 space-y-2 text-sm"
								>
									<div className="grid grid-cols-2 gap-2">
										<div>
											<p className="text-muted-foreground text-xs">Hostname</p>
											<p className="font-medium">{sysInfo.hostname}</p>
										</div>
										<div>
											<p className="text-muted-foreground text-xs">Platform</p>
											<p className="font-medium">{sysInfo.platform}</p>
										</div>
										<div>
											<p className="text-muted-foreground text-xs">CPUs</p>
											<p className="font-medium">{sysInfo.cpus}</p>
										</div>
										<div>
											<p className="text-muted-foreground text-xs">
												Architecture
											</p>
											<p className="font-medium">{sysInfo.arch}</p>
										</div>
										<div className="col-span-2">
											<p className="text-muted-foreground text-xs">
												OS Release
											</p>
											<p className="font-medium">{sysInfo.release}</p>
										</div>
										<div className="col-span-2">
											<p className="text-muted-foreground text-xs">
												Agent Version
											</p>
											<p className="font-medium">{sysInfo.version}</p>
										</div>
									</div>
									<div className="border-t pt-2 flex justify-between text-xs text-muted-foreground">
										<div>
											<p>Connected: {formatDate(session.created_at)}</p>
										</div>
										<div className="flex items-center gap-1">
											Last Seen: {formatDate(session.last_seen_at)}
										</div>
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<p className="text-sm text-muted-foreground">
						No active sessions. Agent has not connected yet.
					</p>
				)}
			</div>

			{/* Pending Codes */}
			<div className="space-y-2">
				<h3 className="font-semibold text-sm flex items-center gap-2">
					Pending Pairing Codes ({data?.agentCodes.length || 0})
				</h3>
				{data && data.agentCodes.length > 0 ? (
					<div className="space-y-2">
						{data.agentCodes.map((code) => (
							<div
								key={code.id}
								className="border rounded-lg p-3 text-sm space-y-2"
							>
								<div className="flex justify-between items-start">
									<div>
										<p className="text-muted-foreground text-xs">Code</p>
										<p className="font-mono font-medium text-xs break-all">
											{code.code}
										</p>
									</div>
									<div className="text-right">
										<p className="text-muted-foreground text-xs">Created</p>
										<p className="font-medium text-xs">
											{formatDate(code.created_at)}
										</p>
									</div>
								</div>
								{code.expires_at && (
									<div className="text-xs text-muted-foreground border-t pt-2">
										<p>Expires: {formatDate(code.expires_at)}</p>
									</div>
								)}
							</div>
						))}
					</div>
				) : (
					<p className="text-sm text-muted-foreground">
						No pending pairing codes.
					</p>
				)}
			</div>

			{/* Backup Jobs */}
			<div className="space-y-2">
				<h3 className="font-semibold text-sm">
					Associated Backup Jobs ({data?.backupJobs.length || 0})
				</h3>
				{data && data.backupJobs.length > 0 ? (
					<div className="space-y-2">
						{data.backupJobs.map((job) => (
							<div
								key={job.id}
								className="border rounded-lg p-3 text-sm flex justify-between items-center"
							>
								<div className="space-y-1">
									<p className="font-medium">{job.name || "Unnamed Job"}</p>
									<p className="text-xs text-muted-foreground">
										Schedule: {job.cron}
									</p>
								</div>
								<div>
									{job.is_active ? (
										<span
											className="text-xs font-medium"
											style={{ color: "var(--greenish)" }}
										>
											Active
										</span>
									) : (
										<span className="text-destructive text-xs font-medium">
											Inactive
										</span>
									)}
								</div>
							</div>
						))}
					</div>
				) : (
					<p className="text-sm text-muted-foreground">
						No backup jobs associated with this agent.
					</p>
				)}
			</div>
		</div>
	);

	if (isMobile) {
		return (
			<Drawer open={open} onOpenChange={onClose}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle className="flex items-center gap-3">
							Agent Details
							<ConnectionStatus status={connectionStatus} type="long" />
						</DrawerTitle>
						<DrawerDescription>
							View agent information, sessions, and pending codes
						</DrawerDescription>
					</DrawerHeader>
					<div className="px-4 pb-4 max-h-[70vh] overflow-y-auto">
						{loading ? (
							<p className="text-muted-foreground">Loading...</p>
						) : (
							content
						)}
					</div>
					<DrawerFooter>
						<DrawerClose asChild>
							<Button variant="outline">
								<XSquareIcon />
								Close
							</Button>
						</DrawerClose>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-3">
						Agent Details
						<ConnectionStatus status={connectionStatus} type="long" />
					</DialogTitle>
					<DialogDescription>
						View agent information, sessions, and pending codes
					</DialogDescription>
				</DialogHeader>
				{loading ? (
					<p className="text-muted-foreground">Loading...</p>
				) : (
					content
				)}
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline">
							<XSquareIcon />
							Close
						</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
