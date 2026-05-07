import Data, { type Column } from "@/components/data/data";
import type { TableAction } from "@/components/data/dataActions";
import DataHeader, { type SearchField } from "@/components/data/dataHeader";
import AgentDialog from "@/components/dialog/agent";
import AgentCodeDialog from "@/components/dialog/agent-code";
import AgentDetailDialog from "@/components/dialog/agent-detail";
import ConfirmDialog from "@/components/dialog/confirm";
import { Button } from "@/components/ui/button";
import { useData } from "@/hooks/use-data";
import { useDialog } from "@/hooks/use-dialog";
import { useSocket } from "@/hooks/use-socket";
import {
	EyeIcon,
	PackageIcon,
	PencilIcon,
	PlusIcon,
	XSquareIcon,
} from "@phosphor-icons/react";
import { QrCodeIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function AgentsPage() {
	const { filters, orderBy } = useData("agents");
	const { openDialog } = useDialog();
	const { agentStatuses } = useSocket();
	const [data, setData] = useState({
		data: [],
		total: 0,
	});
	const [loading, setLoading] = useState(false);
	const filterFields = [
		{
			label: "Name",
			type: "string",
			matching: "contains",
		},
		{
			label: "Active",
			type: "boolean",
			matching: "equals",
		},
	] as SearchField[];

	const getAgentStatus = (agentId: string) => {
		const status = agentStatuses.find((s) => s.agentId === agentId);
		if (!status) return { label: "No Status", color: "text-muted-foreground" };

		const lastSeen = new Date(status.lastSeen || 0);
		const now = new Date();
		const staleThreshold = 60000; // 60 seconds
		const isStale = now.getTime() - lastSeen.getTime() > staleThreshold;

		if (status.status === "disconnected" || status.status === "inactive") {
			return {
				label: "Disconnected",
				color: "text-muted-foreground",
			};
		}

		if (isStale) {
			return { label: "Stale", color: "bg-yellow-500" };
		}

		if (status.currentJob?.status === "running") {
			return {
				label: `Running Backup`,
				color: "bg-blue-300",
			};
		}

		if (status.jobQueue && status.jobQueue.length > 0) {
			return {
				label: `${status.jobQueue.length} in Queue`,
				color: "bg-blue-300",
			};
		}

		if (status.status === "connected") {
			return {
				label: "Connected",
				color: "text-green-200",
			};
		}

		return { label: "Unknown", color: "text-muted-foreground" };
	};

	function formatBytes(bytes: number | null | undefined): string {
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
			format: (value) => {
				const { label, color } = getAgentStatus(value);
				return <span className={`${color} text-xs`}>{label}</span>;
			},
		},
		{
			key: "created_by",
			label: "Created By",
			orderable: false,
			format: (value) => value?.name ?? "—",
		},
		{
			key: "total_size_bytes",
			label: "Total Size",
			orderable: false,
			format: (value) => formatBytes(value),
		},
		{
			key: "created_at",
			label: "Created",
			orderable: true,
			format: (value) => new Date(value).toLocaleString(),
		},
		{
			key: "updated_at",
			label: "Updated",
			orderable: true,
			format: (value) => new Date(value).toLocaleString(),
		},
	] as Column[];

	const actions = [
		{
			id: "gen-code",
			label: "Generate Code",
			icon: <QrCodeIcon />,
			// disabled: (row) => getAgentStatus(row.id).label !== "No Status",
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
			id: "separator",
			divider: true,
		},
		{
			id: "manage",
			label: "Manage",
		},
		{
			id: "backup_jobs",
			label: "Backup Jobs",
			href: (row) => `/backups/${row.id}/jobs`,
			icon: <PackageIcon />,
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
					defaultData: { name: row.name },
					agentId: row.id,
					onConfirm: () => {
						fetchData();
					},
				});
			},
		},
		{
			id: "separator",
			divider: true,
		},
		{
			id: "danger",
			label: "Dangerous",
		},
		{
			id: "disable",
			label: "Disable",
			icon: <XSquareIcon />,
			variant: "destructive",
			onClick: (row) => {
				openDialog(ConfirmDialog, {
					onConfirm: () => {
						disableAgent(row.id);
					},
				});
			},
		},
	] as TableAction[];

	async function disableAgent(agentId: string) {
		try {
			const response = await fetch(`/api/agents/${agentId}/disable`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
			});
			if (response.ok) {
				toast.success("Agent disabled successfully", {
					description: "The agent has been disabled successfully.",
				});
				fetchData();
			} else {
				const error = await response.json();
				toast.error("Error disabling agent", {
					description:
						error instanceof Error ? error.message : String(error.error),
				});
			}
		} catch (error) {
			console.error(error);
			toast.error("Failed to disable agent", {
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
				console.log(result.data);
				setData({ ...data, data: result.data, total: result.total });
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
		<div className="w-full grow px-14 pt-4 flex flex-col gap-6">
			<div>
				<h1 className="text-4xl font-black">Agents</h1>
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
