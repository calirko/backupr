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
import { Pencil, Plus, Trash } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function ClientsPage() {
	const [loading, setLoading] = useState(true);
	const [data, setData] = useState({ items: [], total: 0 });
	const { skip, take, filters, orderBy } = useData("clients");

	const columns = [
		{ key: "name", label: "Name" },
		{ key: "email", label: "Email" },
		{ key: "folderPath", label: "Folder Path" },
		{ key: "backupCount", label: "Backups" },
		{ key: "createdAt", label: "Created" },
	];

	const filterFields = [
		{
			name: "name",
			label: "Name",
			type: "string",
			matching: "contains",
		},
		{
			name: "email",
			label: "Email",
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
			href: (row) => `/clients/${row.id}/edit`,
		},
		{
			id: "delete",
			label: "Delete",
			icon: <Trash />,
			onClick: async (row) => {
				try {
					await Api.del(
						`/api/clients`,
						{ ids: [row.id] },
						{ token: Cookies.get("token") },
					);
					toast.success("Client deleted successfully");
					fetchData();
				} catch (error: any) {
					console.error(error);
					toast.error(error?.message || "Error deleting client");
				}
			},
			onBulkClick: async (rows) => {
				const ids = rows.map((r) => r.id);
				try {
					await Api.del(
						`/api/clients`,
						{ ids },
						{ token: Cookies.get("token") },
					);
					toast.success("Clients deleted successfully");
					fetchData();
				} catch (error: any) {
					console.error(error);
					toast.error(error?.message || "Error deleting clients");
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
			const response: any = await Api.get(
				`/api/clients?${urlParams.toString()}`,
				{
					token: Cookies.get("token"),
				},
			);
			const prettyData = response.data.map((e: any) => ({
				...e,
				backupCount: e._count?.backups || 0,
				updatedAt: <RelativeDate date={new Date(e.updatedAt)} />,
				createdAt: <RelativeDate date={new Date(e.createdAt)} />,
			}));
			setData({ items: prettyData, total: response.total });
		} catch (error) {
			console.error(error);
			toast.error("Error fetching clients");
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
			<DataHeader filterFields={filterFields} name="clients">
				<BulkData
					actions={dataActions}
					total={data.total}
					disabled={loading}
					name="clients"
				>
					<Link href={"/clients/new"}>
						<Button>
							<Plus />
							New Client
						</Button>
					</Link>
				</BulkData>
			</DataHeader>
			<DataTableWrapper>
				<Data
					bulkSelect={false}
					name="clients"
					columns={columns}
					data={data.items}
					loading={loading}
					actions={dataActions}
					showOrderBy
				/>
			</DataTableWrapper>
			<DataFooter total={data.total} loading={loading} name="clients" />
		</div>
	);
}
