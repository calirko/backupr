import {
	EyeIcon,
	PencilIcon,
	PlusIcon,
	XSquareIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import Data, { type Column } from "@/components/data/data";
import DataHeader, { type SearchField } from "@/components/data/dataHeader";
import { Button } from "@/components/ui/button";
import { useData } from "@/hooks/use-data";
import type { TableAction } from "@/components/data/dataActions";
import { QrCodeIcon } from "@phosphor-icons/react/dist/ssr";
import { useDialog } from "@/hooks/use-dialog";
import AgentDialog from "@/components/dialog/agent";
import ConfirmDialog from "@/components/dialog/confirm";
import AgentCodeDialog from "@/components/dialog/agent-code";

export default function AgentsPage() {
	const { filters, orderBy } = useData("agents");
	const { openDialog } = useDialog();
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
		{
			label: "Last Seen",
			type: "string",
			matching: "contains",
		},
	] as SearchField[];

	const columns = [
		{ key: "name", label: "Name", orderable: true },
		{ key: "active", label: "Active", orderable: true },
		{ key: "last_seen", label: "Last Seen", orderable: true },
	] as Column[];

	const actions = [
		{
			id: "connect",
			label: "Connection",
		},
		{
			id: "gen-code",
			label: "Generate Code",
			icon: <QrCodeIcon />,
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
			id: "view",
			label: "Manage",
		},
		{
			id: "view",
			label: "View",
			icon: <EyeIcon />,
			onClick: (row) => {},
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
