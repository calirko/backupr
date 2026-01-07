"use client";

import Data from "@/components/layout/data/data";
import DataFooter from "@/components/layout/data/dataFooter";
import DataHeader, {
	type SearchField,
} from "@/components/layout/data/dataHeader";
import DataTableWrapper from "@/components/layout/dataTableWrapper";
import StatusBadge from "@/components/layout/statusBadge";
import RelativeDate from "@/components/ui/relativeDate";
import { TableLink } from "@/components/ui/table";
import { useData } from "@/hooks/use-data";
import Api from "@/lib/api";
import Cookies from "js-cookie";
import { CheckCircle, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function LogsPage() {
	const [loading, setLoading] = useState(true);
	const [data, setData] = useState({ items: [], total: 0 });
	const { skip, take, filters, orderBy } = useData("logs");

	const columns = [
		{ key: "action", label: "Action" },
		{ key: "status_badge", label: "Status", orderByKey: "status" },
		{ key: "client_name", label: "Client", orderByKey: "client.name" },
		{ key: "message", label: "Message" },
		{ key: "timestamp", label: "Date" },
	];

	const filterFields = [
		{
			name: "action",
			label: "Action",
			type: "select",
			matching: "equals",
			options: [
				{ value: "backup", label: "Backup" },
				{ value: "restore", label: "Restore" },
			],
		},
		{
			name: "status",
			label: "Status",
			type: "select",
			matching: "equals",
			options: [
				{ value: "success", label: "Success" },
				{ value: "failed", label: "Failed" },
			],
		},
	] as SearchField[];

	async function fetchData() {
		const urlParams = new URLSearchParams({
			skip: String(skip),
			take: String(take),
			filters: encodeURIComponent(JSON.stringify(filters)),
			orderBy: encodeURIComponent(JSON.stringify(orderBy)),
		});

		try {
			const response: any = await Api.get(`/api/logs?${urlParams.toString()}`, {
				token: Cookies.get("token"),
			});
			const prettyData = response.data.map((e: any) => ({
				...e,
				client_name: e.client ? (
					<TableLink href={`/clients/${e.client.id}/edit`}>
						{e.client.name}
					</TableLink>
				) : (
					"N/A"
				),
				status_badge: (() => {
					switch (e.status) {
						case "success":
							return (
								<StatusBadge
									label="Success"
									variant="success"
									icon={<CheckCircle size={16} />}
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
				timestamp: <RelativeDate date={new Date(e.timestamp)} />,
			}));
			setData({ items: prettyData, total: response.total });
		} catch (error) {
			console.error(error);
			toast.error("Error fetching logs");
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
			<DataHeader filterFields={filterFields} name="logs">
				<div className="text-sm text-muted-foreground">
					View system logs and activity
				</div>
			</DataHeader>
			<DataTableWrapper>
				<Data
					name="logs"
					columns={columns}
					data={data.items}
					loading={loading}
					showOrderBy
				/>
			</DataTableWrapper>
			<DataFooter total={data.total} loading={loading} name="logs" />
		</div>
	);
}
