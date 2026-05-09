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
import { useDialog } from "@/hooks/use-dialog";
import ConfirmDialog from "@/components/dialog/confirm";
import UserDialog from "@/components/dialog/user";

export default function UsersPage() {
	const { filters, orderBy } = useData("users");
	const { openDialog } = useDialog();
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
			type: "string" as const,
			matching: "contains" as const,
		},
		{
			name: "username",
			label: "Username",
			type: "string" as const,
			matching: "contains" as const,
		},
		{
			name: "email",
			label: "Email",
			type: "string" as const,
			matching: "contains" as const,
		},
		{
			name: "created_at",
			label: "Created Date",
			type: "date" as const,
			matching: "between" as const,
		},
	] as SearchField[];

	const columns = [
		{ key: "name", label: "Name", orderable: true },
		{ key: "username", label: "Username", orderable: true },
		{ key: "email", label: "Email", orderable: true },
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
			id: "view",
			label: "View",
			icon: <EyeIcon />,
			onClick: (row) => {
				openDialog(UserDialog, {
					defaultData: {
						name: row.name,
						username: row.username,
						email: row.email,
					},
					userId: row.id,
					readonly: true,
					onConfirm: () => {
						fetchData();
					},
				});
			},
		},
		{
			id: "edit",
			label: "Edit",
			icon: <PencilIcon />,
			onClick: (row) => {
				openDialog(UserDialog, {
					defaultData: {
						name: row.name,
						username: row.username,
						email: row.email,
					},
					userId: row.id,
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
			variant: "destructive" as const,
			onClick: (row) => {
				openDialog(ConfirmDialog, {
					title: "Delete User",
					description:
						"Are you sure you want to delete this user? This action cannot be undone.",
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
				setData({
					...data,
					data: result.data,
					total: result.total,
					absoluteTotal: result.absoluteTotal,
				});
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
		<div className="w-full grow px-3 sm:px-14 pt-4 flex flex-col gap-6">
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
						New User
					</Button>
				</DataHeader>
				<Data
					showOrderBy
					actions={actions}
					columns={columns}
					data={data.data}
					loading={loading}
					name="users"
					absoluteTotal={data.absoluteTotal}
				/>
			</div>
		</div>
	);
}
