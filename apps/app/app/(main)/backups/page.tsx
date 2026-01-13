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
import { CheckCircle, Clock, Download, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function BackupsPage() {
	const [loading, setLoading] = useState(true);
	const [data, setData] = useState({ items: [], total: 0 });
	const { skip, take, filters, orderBy } = useData("backups");

	const columns = [
		{ key: "backupName", label: "Nome" },
		{ key: "client_name", label: "Cliente", orderByKey: "client.name" },
		{ key: "version", label: "Versão" },
		{ key: "status_badge", label: "Status", orderByKey: "status" },
		{ key: "filesCount", label: "Arquivos" },
		{ key: "totalSize", label: "Tamanho" },
		{ key: "createdAt", label: "Data" },
	];

	const filterFields = [
		{
			name: "client_name",
			label: "Cliente",
			type: "string",
			matching: "contains",
		},
		{
			name: "backupName",
			label: "Nome",
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
			label: "Baixar",
			icon: <Download className="h-4 w-4" />,
			onClick: (row) => {
				const token = Cookies.get("token");
				window.location.href = `/api/backup/${row.id}/download?apiKey=${token}`;
			},
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
				`/api/backup?${urlParams.toString()}`,
				{
					token: Cookies.get("token"),
				},
			);
			const prettyData = response.data.map((e: any) => ({
				...e,
				client_name: e.client ? (
					<TableLink href={`/clients/${e.client.id}/edit`}>
						{e.client.name}
					</TableLink>
				) : e.user ? (
					<TableLink href={`/users/${e.user.id}/edit`}>{e.user.name}</TableLink>
				) : (
					"N/A"
				),
				status_badge: (() => {
					switch (e.status) {
						case "completed":
							return (
								<StatusBadge
									label="Completo"
									variant="success"
									icon={<CheckCircle size={16} />}
								/>
							);
						case "in_progress":
							return (
								<StatusBadge
									label="Em Progresso"
									variant="warning"
									icon={<Clock size={16} />}
								/>
							);
						case "failed":
							return (
								<StatusBadge
									label="Falhou"
									variant="destructive"
									icon={<XCircle size={16} />}
								/>
							);
						default:
							return e.status;
					}
				})(),
				totalSize: formatBytes(e.totalSize),
				createdAt: <RelativeDate date={new Date(e.createdAt)} />,
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
		const b = typeof bytes === "bigint" ? Number(bytes) : bytes;
		if (b === 0) return "0 Bytes";
		const k = 1024;
		const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
		const i = Math.floor(Math.log(b) / Math.log(k));
		return `${Math.round((b / k ** i) * 100) / 100} ${sizes[i]}`;
	}

	useEffect(() => {
		setLoading(true);
		fetchData();
	}, [skip, take, filters, orderBy]);

	return (
		<div className="flex flex-col gap-3 md:gap-4 h-full">
			<DataHeader filterFields={filterFields} name="backups">
				<p className="text-muted-foreground">Veja os backups realizados</p>
			</DataHeader>
			<DataTableWrapper>
				<Data
					bulkSelect={false}
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
