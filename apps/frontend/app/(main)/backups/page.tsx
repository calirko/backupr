"use client";

import Data from "@/components/layout/data/data";
import { TableAction } from "@/components/layout/data/dataActions";
import DataFooter from "@/components/layout/data/dataFooter";
import DataHeader, {
	type SearchField,
} from "@/components/layout/data/dataHeader";
import DataTableWrapper from "@/components/layout/dataTableWrapper";
import StatusBadge from "@/components/layout/statusBadge";
import RelativeDate from "@/components/ui/relative-date";
import { TableLink } from "@/components/ui/table";
import { useData } from "@/hooks/use-data";
import Api from "@/lib/api";
import Cookies from "js-cookie";
import { Download, Trash, HardDrive, CheckCircle, XCircle, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function BackupsPage() {
	const [loading, setLoading] = useState(true);
	const [data, setData] = useState({ items: [], total: 0 });
	const { skip, take, filters, orderBy } = useData("backups");

	const columns = [
		{ key: "backupName", label: "Backup Name" },
		{ key: "client_name", label: "Client", orderByKey: "client.name" },
		{ key: "version", label: "Version" },
		{ key: "status_badge", label: "Status", orderByKey: "status" },
		{ key: "filesCount", label: "Files" },
		{ key: "totalSize", label: "Size" },
		{ key: "timestamp", label: "Date" },
	];

	const filterFields = [
		{
			name: "backupName",
			label: "Backup Name",
			type: "string",
			matching: "contains",
		},
		{
			name: "status",
			label: "Status",
			type: "select",
			matching: "equals",
			options: [
				{ value: "completed", label: "Completed" },
				{ value: "in_progress", label: "In Progress" },
				{ value: "failed", label: "Failed" },
			],
		},
	] as SearchField[];

	const dataActions: TableAction[] = [
		{
			label: "Actions",
			id: "general",
		},
		{
			id: "download",
			label: "View Details",
			icon: <HardDrive />,
			onClick: async (row) => {
				toast.info("Backup details functionality coming soon");
			},
		},
		{
			id: "delete",
			label: "Delete",
			icon: <Trash />,
			onClick: async (row) => {
				try {
					await Api.del(
						`/api/backups`,
						{ ids: [row.id] },
						{ token: Cookies.get("token") },
					);
					toast.success("Backup deleted successfully");
					fetchData();
				} catch (error: any) {
					console.error(error);
					toast.error(error?.message || "Error deleting backup");
				}
			},
			onBulkClick: async (rows) => {
				const ids = rows.map((r) => r.id);
				try {
					await Api.del(`/api/backups`, { ids }, { token: Cookies.get("token") });
					toast.success("Backups deleted successfully");
					fetchData();
				} catch (error: any) {
					console.error(error);
					toast.error(error?.message || "Error deleting backups");
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
			const response: any = await Api.get(`/api/backups?${urlParams.toString()}`, {
				token: Cookies.get("token"),
			});
			const prettyData = response.data.map((e: any) => ({
				...e,
				client_name: e.client ? (
					<TableLink href={`/clients/${e.client.id}/edit`}>
						{e.client.name}
					</TableLink>
				) : e.user ? (
					<TableLink href={`/users/${e.user.id}/edit`}>
						{e.user.name}
					</TableLink>
				) : (
					"N/A"
				),
				status_badge: (() => {
					switch (e.status) {
						case "completed":
							return (
								<StatusBadge
									label="Completed"
									variant="success"
									icon={<CheckCircle size={16} />}
								/>
							);
						case "in_progress":
							return (
								<StatusBadge
									label="In Progress"
									variant="warning"
									icon={<Clock size={16} />}
								/>
							);
						case "failed":
							return (
								<StatusBadge
									label="Failed"
									variant="destructive"
									icon={<XCircle size={16} />}
								/>
							);
						default:
							return e.status;
					}
				})(),
				totalSize: formatBytes(e.totalSize),
				timestamp: <RelativeDate date={new Date(e.timestamp)} />,
			}));
			setData({ items: prettyData, total: response.total });
		} catch (error) {
			console.error(error);
			toast.error("Error fetching backups");
		} finally {
			setLoading(false);
		}
	}

	function formatBytes(bytes: number | bigint): string {
		const b = typeof bytes === 'bigint' ? Number(bytes) : bytes;
		if (b === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(b) / Math.log(k));
		return Math.round(b / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
	}

	useEffect(() => {
		setLoading(true);
		fetchData();
	}, [skip, take, filters, orderBy]);

	return (
		<div className="flex flex-col gap-3 md:gap-4 h-full">
			<DataHeader filterFields={filterFields} name="backups">
				<div className="text-sm text-muted-foreground">
					View and manage all backups
				</div>
			</DataHeader>
			<DataTableWrapper>
				<Data
					name="backups"
					columns={columns}
					data={data.items}
					loading={loading}
					actions={dataActions}
					showOrderBy
				/>
			</DataTableWrapper>
			<DataFooter total={data.total} loading={loading} name="backups" />
		</div>
	);
}
