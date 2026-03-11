"use client";

import Data from "@/components/layout/data/data";
import type { TableAction } from "@/components/layout/data/dataActions";
import DataFooter from "@/components/layout/data/dataFooter";
import DataHeader, {
	type SearchField,
} from "@/components/layout/data/dataHeader";
import DataTableWrapper from "@/components/layout/dataTableWrapper";
import RelativeDate from "@/components/ui/relative-date";
import { TableLink } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useData } from "@/hooks/use-data";
import Api from "@/lib/api";
import Cookies from "js-cookie";
import { Download, Grid2X2, Table } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import BackupDetailsGrid from "./BackupDetailsGrid";
import ClientsGrid from "./ClientsGrid";
import GroupedBackupsGrid from "./GroupedBackupsGrid";
import { formatBytes, renderStatusBadge } from "./helpers";
import type { BackupDetail, Client, ClientState, GroupedBackup } from "./types";

export default function BackupsPage() {
	const [loading, setLoading] = useState(true);
	// biome-ignore lint/suspicious/noExplicitAny: Table rows contain JSX elements
	const [data, setData] = useState<{ items: any[]; total: number }>({
		items: [],
		total: 0,
	});
	const { skip, take, filters, orderBy } = useData("backups");
	const [tab, setTab] = useState("blocks");

	// Blocks view state
	const [clients, setClients] = useState<Client[]>([]);
	const [selectedClient, setSelectedClient] = useState<string | null>(null);
	const [groupedBackups, setGroupedBackups] = useState<GroupedBackup[]>([]);
	const [selectedBackupName, setSelectedBackupName] = useState<string | null>(
		null,
	);
	const [backupDetails, setBackupDetails] = useState<BackupDetail[]>([]);
	const [loadingBlocks, setLoadingBlocks] = useState(false);
	const [clientStates, setClientStates] = useState<Map<string, ClientState>>(
		new Map(),
	);
	const [triggeringBackups, setTriggeringBackups] = useState<Set<string>>(
		new Set(),
	);
	const wsRef = useRef<WebSocket | null>(null);
	const columns = [
		{ key: "backupName", label: "Name" },
		{ key: "client_name", label: "Cliente", orderByKey: "client.name" },
		{ key: "version", label: "Version" },
		{ key: "status_badge", label: "Status", orderByKey: "status" },
		{ key: "filesCount", label: "Files" },
		{ key: "totalSize", label: "Size" },
		{ key: "createdAt", label: "Data" },
	];

	const filterFields = [
		{
			name: "client_name",
			label: "Client",
			type: "string",
			matching: "contains",
		},
		{
			name: "backupName",
			label: "Name",
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
			label: "Download",
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
			const response: { data: BackupDetail[]; total: number } = await Api.get(
				`/api/backup?${urlParams.toString()}`,
				{
					token: Cookies.get("token"),
				},
			);
			const prettyData = response.data.map((e) => ({
				...e,
				client_name: e.client ? (
					<TableLink href={`/clients/${e.client.id}/edit`}>
						{e.client.name}
					</TableLink>
				) : (
					"N/A"
				),
				status_badge: renderStatusBadge(e.status),
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

	// Fetch clients for blocks view
	async function fetchClients(currentFilters = filters) {
		setLoadingBlocks(true);
		try {
			const params = new URLSearchParams();
			const clientName = currentFilters.client_name as string | undefined;
			if (clientName) params.set("search", clientName);

			const response: { clients: Client[] } = await Api.get(
				`/api/backup/clients${params.toString() ? `?${params.toString()}` : ""}`,
				{
					token: Cookies.get("token"),
				},
			);
			setClients(response.clients);
		} catch (error) {
			console.error(error);
			toast.error("Error fetching clients");
		} finally {
			setLoadingBlocks(false);
		}
	}

	// Silently refresh grouped backups (no loading spinner – used after WS status updates)
	async function fetchGroupedBackupsQuietly(clientId: string) {
		try {
			const params = new URLSearchParams({ clientId });
			const response: { data: GroupedBackup[] } = await Api.get(
				`/api/backup/grouped?${params.toString()}`,
				{ token: Cookies.get("token") },
			);
			setGroupedBackups(response.data);
		} catch (error) {
			console.error("Silent grouped backup refresh failed:", error);
		}
	}

	// Fetch grouped backups for a client
	async function fetchGroupedBackups(
		clientId: string,
		currentFilters = filters,
	) {
		setLoadingBlocks(true);
		try {
			const params = new URLSearchParams({ clientId });
			const backupName = currentFilters.backupName as string | undefined;
			const status = currentFilters.status as string | undefined;
			if (backupName) params.set("backupName", backupName);
			if (status) params.set("status", status);

			const response: { data: GroupedBackup[] } = await Api.get(
				`/api/backup/grouped?${params.toString()}`,
				{
					token: Cookies.get("token"),
				},
			);
			setGroupedBackups(response.data);
			setSelectedClient(clientId);
			setSelectedBackupName(null);
			setBackupDetails([]);
		} catch (error) {
			console.error(error);
			toast.error("Error fetching backups");
		} finally {
			setLoadingBlocks(false);
		}
	}

	// Trigger an immediate backup by sending a message over the WS connection.
	// Errors arrive back as trigger-error messages; the optimistic lock is released
	// either by the WS service (trigger-error) or when the backup becomes active
	// (client-state-update with activeBackup set).
	function triggerBackup(backupName: string) {
		if (!selectedClient) return;
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			toast.error("Not connected to the WebSocket service. Please refresh.");
			return;
		}
		setTriggeringBackups((prev) => new Set(prev).add(backupName));
		ws.send(
			JSON.stringify({
				type: "trigger-backup",
				clientId: selectedClient,
				backupName,
			}),
		);
	}

	// Fetch backup details for a specific backup name
	async function fetchBackupDetails(clientId: string, backupName: string) {
		setLoadingBlocks(true);
		try {
			const response: { data: BackupDetail[] } = await Api.get(
				`/api/backup/by-name?clientId=${clientId}&backupName=${encodeURIComponent(backupName)}`,
				{
					token: Cookies.get("token"),
				},
			);
			setBackupDetails(response.data);
			setSelectedBackupName(backupName);
		} catch (error) {
			console.error(error);
			toast.error("Error fetching backup details");
		} finally {
			setLoadingBlocks(false);
		}
	}

	useEffect(() => {
		if (tab === "all") {
			setLoading(true);
			fetchData();
		} else if (tab === "blocks") {
			if (selectedClient) {
				fetchGroupedBackups(selectedClient, filters);
			} else {
				fetchClients(filters);
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tab, skip, take, filters, orderBy]);

	useEffect(() => {
		const wsServiceUrl = process.env.NEXT_PUBLIC_WS_URL;
		if (!wsServiceUrl) {
			console.error("[frontend-ws] NEXT_PUBLIC_WS_URL is not configured");
			return;
		}

		const token = Cookies.get("token");
		const ws = new WebSocket(`${wsServiceUrl}/frontend-ws?token=${token}`);
		wsRef.current = ws;

		ws.onopen = () => {
			ws.send(JSON.stringify({ type: "subscribe" }));
			console.log("[frontend-ws] connected");
		};

		ws.onmessage = (event) => {
			let msg: {
				type: string;
				states?: Record<string, ClientState>;
				clientId?: string;
				state?: ClientState;
				backupName?: string;
				error?: string;
			};
			try {
				msg = JSON.parse(event.data);
				console.log("[frontend-ws] received message:", msg);
			} catch {
				console.warn("[frontend-ws] received non-JSON message:", event.data);
				return;
			}

			if (msg.type === "all-client-states" && msg.states) {
				setClientStates(new Map(Object.entries(msg.states)));
			} else if (
				msg.type === "client-state-update" &&
				msg.clientId &&
				msg.state
			) {
				const { clientId, state } = msg as {
					clientId: string;
					state: ClientState;
				};
				setClientStates((prev) => new Map(prev).set(clientId, state));
				if (state.activeBackup) {
					const activeName = state.activeBackup.backupName;
					setTriggeringBackups((prev) => {
						const next = new Set(prev);
						next.delete(activeName);
						return next;
					});
				}
			} else if (msg.type === "trigger-error" && msg.backupName) {
				const errMsg = msg.error || "Failed to trigger backup";
				toast.error(errMsg);
				setTriggeringBackups((prev) => {
					const next = new Set(prev);
					next.delete(msg.backupName as string);
					return next;
				});
			}
		};

		ws.onerror = (err) => {
			console.error("[frontend-ws] error:", err);
		};

		return () => {
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
				console.log("[frontend-ws] disconnected");
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Detect backup completion for the selected client and refresh + toast
	const prevActiveBackupForClientRef = useRef<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: fetchGroupedBackupsQuietly is a stable component-level function
	useEffect(() => {
		if (!selectedClient) {
			prevActiveBackupForClientRef.current = null;
			return;
		}
		const state = clientStates.get(selectedClient);
		const current = state?.activeBackup?.backupName ?? null;
		const prev = prevActiveBackupForClientRef.current;

		if (prev !== null && current === null) {
			// Backup just finished
			const wasError =
				state?.lastError != null && state.lastError.backupName === prev;
			if (wasError) {
				toast.error(`Backup "${prev}" failed`);
			} else {
				toast.success(`Backup "${prev}" finished`);
			}
			fetchGroupedBackupsQuietly(selectedClient);
		}

		prevActiveBackupForClientRef.current = current;
	}, [clientStates, selectedClient]);

	return (
		<div className="flex flex-col h-full gap-3 md:gap-4 ">
			<DataHeader filterFields={filterFields} name="backups">
				<Tabs value={tab} onValueChange={setTab}>
					<TabsList>
						<TabsTrigger value="blocks" className="w-30">
							<Grid2X2 />
						</TabsTrigger>
						<TabsTrigger value="all">
							<Table />
						</TabsTrigger>
					</TabsList>
				</Tabs>
			</DataHeader>
			{tab === "all" ? (
				<>
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
				</>
			) : (
				<div className="flex flex-col gap-4 overflow-auto">
					{loadingBlocks ? (
						<div className="flex justify-center items-center py-8">
							<div className="text-muted-foreground text-xs">Loading...</div>
						</div>
					) : (
						<>
							{/* Clients Grid */}
							{!selectedClient && (
								<ClientsGrid
									clients={clients}
									clientStates={clientStates}
									onSelectClient={fetchGroupedBackups}
								/>
							)}

							{/* Grouped Backups */}
							{selectedClient && !selectedBackupName && (
								<GroupedBackupsGrid
									clientName={
										clients.find((c) => c.id === selectedClient)?.name ??
										"Unknown Client"
									}
									groupedBackups={groupedBackups}
									selectedClient={selectedClient}
									clientStates={clientStates}
									triggeringBackups={triggeringBackups}
									onBack={() => {
										setSelectedClient(null);
										setGroupedBackups([]);
									}}
									onSelectBackup={(backupName) =>
										fetchBackupDetails(selectedClient, backupName)
									}
									onTriggerBackup={triggerBackup}
								/>
							)}

							{/* Backup Details Grid */}
							{selectedBackupName && backupDetails.length > 0 && (
								<BackupDetailsGrid
									selectedClient={selectedClient}
									clientStates={clientStates}
									clientName={
										clients.find((c) => c.id === selectedClient)?.name ??
										"Unknown Client"
									}
									backupDetails={backupDetails}
									selectedBackupName={selectedBackupName}
									onBack={() => {
										setSelectedBackupName(null);
										setBackupDetails([]);
									}}
								/>
							)}
						</>
					)}
				</div>
			)}
		</div>
	);
}
