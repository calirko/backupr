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
import UserDialog from "@/components/dialog/user";

export default function UsersPage() {
	const { filters, orderBy } = useData("users");
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
			label: "Email",
			type: "string",
			matching: "contains",
		},
	] as SearchField[];

	const columns = [
		{ key: "name", label: "Name", orderable: true },
		{ key: "email", label: "Email", orderable: true },
	] as Column[];

	const actions = [
		{
			id: "view",
			label: "Manage",
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
			id: "delete",
			label: "Delete",
			icon: <XSquareIcon />,
			variant: "destructive",
			onClick: (row) => {
				openDialog(ConfirmDialog, {
					onConfirm: () => {
						deleteUser(row.id);
					},
				});
			},
		},
	] as TableAction[];

	async function deleteUser(userId: string) {
		try {
			const response = await fetch(`/api/users/${userId}`, {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
			});
			if (response.ok) {
				toast.success("User deleted successfully", {
					description: "The user has been deleted successfully.",
				});
				fetchData();
			} else {
				const error = await response.json();
				toast.error("Error deleting user", {
					description:
						error instanceof Error ? error.message : String(error.error),
				});
			}
		} catch (error) {
			console.error(error);
			toast.error("Failed to delete user", {
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
			const response = await fetch(`/api/users?${params}`, {
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
				toast.error("Error fetching users", {
					description:
						error instanceof Error ? error.message : String(error.error),
				});
			}
		} catch (error) {
			console.error(error);
			toast.error("Failed to fetch users", {
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
				<h1 className="text-4xl font-black">Users</h1>
				<p className="text-muted-foreground text-sm">
					Create, edit, and manage users.
				</p>
			</div>
			<div className="flex-col flex gap-4">
				<DataHeader filterFields={filterFields} name="users">
					<Button
						onClick={() => {
							openDialog(UserDialog, {
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
					name="users"
				/>
			</div>
		</div>
	);
}
