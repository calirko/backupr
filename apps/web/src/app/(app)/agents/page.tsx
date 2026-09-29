import {
	ChartBarIcon,
	CodeSimpleIcon,
	EyeIcon,
	PackageIcon,
	PencilIcon,
	PlusIcon,
	XSquareIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import Data, { type Column } from "@/components/data/data";
import type { TableAction } from "@/components/data/dataActions";
import DataHeader, { type SearchField } from "@/components/data/dataHeader";
import AgentDialog from "@/components/dialog/agent";
import AgentCodeDialog from "@/components/dialog/agent-code";
import AgentDetailDialog from "@/components/dialog/agent-detail";
import AgentStatusHistoryDialog from "@/components/dialog/agent-status-history";
import ConfirmDialog from "@/components/dialog/confirm";
import ErrorDialog from "@/components/dialog/error";
import { Button } from "@/components/ui/button";
import {
	type AgentConnectionStatus,
	ConnectionStatus,
} from "@/components/ui/connection-status";
import { useData } from "@/hooks/use-data";
import { useDialog } from "@/hooks/use-dialog";
import { useSocket } from "@/hooks/use-socket";
import { AgentVersion, Count, formatBytes, LastSeen } from "@/lib/health";

export default function AgentsPage() {
	const { filters, orderBy } = useData("agents");
	const { openDialog } = useDialog();
	const { agentStatuses } = useSocket();
	const [data, setData] = useState({
		data: [],
		total: 0,
		absoluteTotal: 0,
	});
	const [loading, setLoading] = useState(false);
	const filterFields = [
		{
			name: "name",
			label: "Name",
			type: "string",
			matching: "contains",
		},
		{
			name: "is_active",
			label: "Active",
			type: "select",
			matching: "equals",
			options: [
				{ value: "true", label: "Yes" },
				{ value: "false", label: "No" },
			],
		},
		{
			name: "created_by.name",
			label: "Created By",
			type: "string",
			matching: "contains",
		},
		{
			name: "created_at",
			label: "Created Date",
			type: "date",
			matching: "between",
		},
	] as SearchField[];

	const getAgentStatus = (agentId: string): AgentConnectionStatus => {
		const status = agentStatuses.find((s) => s.agentId === agentId);
		if (!status) return "none";
		if (status.status === "disconnected" || status.status === "inactive")
			return "disconnected";
		const isStale =
			Date.now() - new Date(status.lastSeen || 0).getTime() > 60000;
		if (isStale) return "stale";
		if (status.currentJob?.status === "running") return "running";
		if (status.schedulerQueued) return "scheduler_queued";
		if (status.jobQueue && status.jobQueue.length > 0) return "queued";
		if (status.status === "connected") return "connected";
		return "unknown";
	};

	const columns = [
		{ key: "name", label: "Name", orderable: true },
		{
			key: "is_active",
			label: "Active",
			orderable: true,
			format: (value) =>
				value ? "Active" : <span className="text-destructive">Inactive</span>,
		},
		{
			key: "id",
			label: "Status",
			orderable: false,
			format: (value) => (
				<ConnectionStatus status={getAgentStatus(value)} type="long" />
			),
		},
		{
			key: "uptime_pct",
			label: "Uptime (7d)",
			orderable: false,
			format: (value) =>
				value == null ? (
					"-"
				) : (
					<span
						className={value < 90 ? "text-destructive" : undefined}
						style={
							value >= 90 && value < 99
								? { color: "var(--yellowish)" }
								: value >= 99
									? { color: "var(--greenish)" }
									: undefined
						}
					>
						{value.toFixed(1)}%
					</span>
				),
		},
		{
			key: "jobs",
			label: "Jobs",
			orderable: false,
			format: (value) => (
				<span>
					{value.active}
					{value.total > value.active && (
						<span className="text-muted-foreground">
							{" "}
							(+{value.total - value.active} paused)
						</span>
					)}
					{value.stale > 0 && (
						<span className="text-destructive"> · {value.stale} stale</span>
					)}
				</span>
			),
		},
		{
			key: "failed_7d",
			label: "Failed (7d)",
			orderable: false,
			format: (value) => <Count value={value} />,
		},
		{
			key: "last_success",
			label: "Last Success",
			orderable: false,
			format: (value) => <LastSeen at={value.at} overdue={value.overdue} />,
		},
		{
			key: "version",
			label: "Version",
			orderable: false,
			format: (value) => (
				<AgentVersion
					version={value.version}
					updateAvailable={value.updateAvailable}
				/>
			),
		},
		{
			key: "total_size_bytes",
			label: "Total Size",
			orderable: false,
			format: (value) => formatBytes(value),
		},
	] as Column[];

	const actions = [
		{
			id: "actions",
			label: "Actions",
		},
		{
			id: "gen-code",
			label: "Pairing Code",
			icon: <CodeSimpleIcon />,
			disabled: (row) => !row.is_active,
			onClick: (row) => {
				openDialog(AgentCodeDialog, {
					agentId: row.id,
					onConfirm: () => {
						fetchData();
					},
				});
			},
		},
		{
			id: "backup_jobs",
			label: "Backup Jobs",
			href: (row) => `/backups/${row.id}/jobs`,
			icon: <PackageIcon />,
		},
		{
			id: "separator",
			divider: true,
		},
		{
			id: "manage",
			label: "Manage",
		},
		{
			id: "status-history",
			label: "Status History",
			icon: <ChartBarIcon />,
			onClick: (row) => {
				openDialog(AgentStatusHistoryDialog, {
					agentId: row.id,
					agentName: row.name,
				});
			},
		},
		{
			id: "view",
			label: "View",
			icon: <EyeIcon />,
			onClick: (row) => {
				openDialog(AgentDetailDialog, {
					agentId: row.id,
				});
			},
		},

		{
			id: "edit",
			label: "Edit",
			icon: <PencilIcon />,
			onClick: (row) => {
				openDialog(AgentDialog, {
					defaultData: { name: row.name, is_active: row.is_active },
					agentId: row.id,
					onConfirm: () => {
						fetchData();
					},
				});
			},
		},
		{
			id: "2-separator",
			divider: true,
		},
		{
			id: "danger",
			label: "Dangerous",
		},
		{
			id: "delete",
			label: "Delete",
			icon: <XSquareIcon />,
			variant: "destructive" as const,
			onClick: (row) => {
				openDialog(ConfirmDialog, {
					title: "Delete Agent",
					description:
						"Are you sure you want to delete this agent? This action cannot be undone.",
					onConfirm: () => {
						deleteAgent(row.id);
					},
				});
			},
		},
	] as TableAction[];

	async function deleteAgent(agentId: string) {
		try {
			const response = await fetch(`/api/agents/${agentId}`, {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
			});
			if (response.ok) {
				toast.success("Agent deleted successfully", {
					description: "The agent has been deleted.",
				});
				fetchData();
			} else {
				const error = await response.json();
				if (response.status === 409) {
					openDialog(ErrorDialog, {
						title: "Cannot Delete Agent",
						description:
							"This agent cannot be deleted while it has backup jobs assigned.",
						message: error.error || "Unknown error",
					});
				} else {
					toast.error("Error deleting agent", {
						description: error.error || "Unknown error",
					});
				}
			}
		} catch (error) {
			console.error(error);
			toast.error("Failed to delete agent", {
				description: error instanceof Error ? error.message : String(error),
			});
		}
	}

	async function fetchData() {
		setLoading(true);

		try {
			const params = new URLSearchParams({
				filters: encodeURIComponent(JSON.stringify(filters)),
				orderBy: encodeURIComponent(JSON.stringify(orderBy)),
			});
			const response = await fetch(`/api/agents?${params}`, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
			});
			if (response.ok) {
				const result = await response.json();
				setData({
					...data,
					data: result.data.map((agent: any) => ({
						...agent,
						jobs: {
							active: agent.active_jobs,
							total: agent.total_jobs,
							stale: agent.stale_jobs,
						},
						last_success: {
							at: agent.last_backup_at,
							overdue: agent.stale_jobs > 0,
						},
						version: {
							version: agent.agent_version,
							updateAvailable: agent.update_available,
						},
					})),
					total: result.total,
					absoluteTotal: result.absoluteTotal,
				});
			} else {
				const error = await response.json();
				toast.error("Error fetching agents", {
					description:
						error instanceof Error ? error.message : String(error.error),
				});
			}
		} catch (error) {
			console.error(error);
			toast.error("Failed to fetch agents", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		fetchData();
	}, [filters, orderBy]);

	return (
		<div className="w-full grow px-3 sm:px-14 pt-4 flex flex-col gap-6">
			<div>
				<h1 className="text-4xl font-heading">Agents</h1>
				<p className="text-muted-foreground text-sm">
					Manage your agents and view their backup status.
				</p>
			</div>
			<div className="flex-col flex gap-4">
				<DataHeader filterFields={filterFields} name="agents">
					<Button
						onClick={() => {
							openDialog(AgentDialog, {
								onConfirm: fetchData,
							});
						}}
					>
						<PlusIcon />
						New Agent
					</Button>
				</DataHeader>
				<Data
					showOrderBy
					absoluteTotal={data.absoluteTotal}
					actions={actions}
					columns={columns}
					data={data.data}
					loading={loading}
					name="agents"
				/>
			</div>
		</div>
	);
}
