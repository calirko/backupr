"use client";

import BulkData from "@/components/layout/data/bulkData";
import Data from "@/components/layout/data/data";
import { TableAction } from "@/components/layout/data/dataActions";
import DataFooter from "@/components/layout/data/dataFooter";
import DataHeader, {
	type SearchField,
} from "@/components/layout/data/dataHeader";
import DataTableWrapper from "@/components/layout/dataTableWrapper";
import { Button } from "@/components/ui/button";
import RelativeDate from "@/components/ui/relative-date";
import { useData } from "@/hooks/use-data";
import Api from "@/lib/api";
import Cookies from "js-cookie";
import { Pencil, Trash, UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Token } from "@/lib/token";

export default function UsersPage() {
	const [loading, setLoading] = useState(true);
	const [data, setData] = useState({ items: [], total: 0 });
	const { skip, take, filters, orderBy } = useData("users");
	const [currentUserId, setCurrentUserId] = useState<string | null>(null);

	useEffect(() => {
		const token = Cookies.get("token");
		if (token) {
			const payload = Token.payload(token);
			if (payload) {
				setCurrentUserId(payload.userId);
			}
		}
	}, []);

	const columns = [
		{ key: "name", label: "Name" },
		{ key: "email", label: "Email" },
		{ key: "createdAt", label: "Created" },
	];

	const filterFields = [
		{
			name: "email",
			label: "Email",
			type: "string",
			matching: "contains",
		},
		{
			name: "name",
			label: "Name",
			type: "string",
			matching: "contains",
		},
	] as SearchField[];

	const dataActions: TableAction[] = [
		{
			label: "Actions",
			id: "general",
		},
		{
			id: "edit",
			label: "Edit",
			icon: <Pencil />,
			href: (row) => `/users/${row.id}/edit`,
		},
		{
			id: "delete",
			label: "Delete",
			icon: <Trash />,
			disabled: (row) => row.id === currentUserId,
			onClick: async (row) => {
				try {
					await Api.del(
						`/api/users`,
						{ ids: [row.id] },
						{ token: Cookies.get("token") },
					);
					toast.success("User deleted successfully");
					fetchData();
				} catch (error: any) {
					console.error(error);
					toast.error(error?.message || "Error deleting user");
				}
			},
			onBulkClick: async (rows) => {
				const ids = rows.map((r) => r.id);
				try {
					await Api.del(`/api/users`, { ids }, { token: Cookies.get("token") });
					toast.success("Users deleted successfully");
					fetchData();
				} catch (error: any) {
					console.error(error);
					toast.error(error?.message || "Error deleting users");
				}
			},
			requireConfirmation: true,
			variant: "destructive",
		},
	];

	async function fetchData() {
		const urlParams = new URLSearchParams({
			skip: String(skip),
			take: String(take),
			filters: encodeURIComponent(JSON.stringify(filters)),
			orderBy: encodeURIComponent(JSON.stringify(orderBy)),
		});

		try {
			const response: any = await Api.get(`/api/users?${urlParams.toString()}`, {
				token: Cookies.get("token"),
			});
			const prettyData = response.data.map((e: any) => ({
				...e,
				createdAt: <RelativeDate date={new Date(e.createdAt)} />,
			}));
			setData({ items: prettyData, total: response.total });
		} catch (error) {
			console.error(error);
			toast.error("Error fetching users");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		setLoading(true);
		fetchData();
	}, [skip, take, filters, orderBy]);

	return (
		<div className="flex flex-col gap-3 md:gap-4 h-full">
			<DataHeader filterFields={filterFields} name="users">
				<BulkData
					actions={dataActions}
					total={data.total}
					disabled={loading}
					name="users"
				>
					<Link href={"/users/new"}>
						<Button>
							<UserPlus />
							New User
						</Button>
					</Link>
				</BulkData>
			</DataHeader>
			<DataTableWrapper>
				<Data
					name="users"
					columns={columns}
					data={data.items}
					loading={loading}
					actions={dataActions}
					showOrderBy
				/>
			</DataTableWrapper>
			<DataFooter total={data.total} loading={loading} name="users" />
		</div>
	);
}
