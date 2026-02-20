"use client";

import Data from "@/components/layout/data/data";
import type { TableAction } from "@/components/layout/data/dataActions";
import DataFooter from "@/components/layout/data/dataFooter";
import DataHeader, {
	type SearchField,
} from "@/components/layout/data/dataHeader";
import DataTableWrapper from "@/components/layout/dataTableWrapper";
import StatusBadge from "@/components/layout/statusBadge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import RelativeDate from "@/components/ui/relative-date";
import { TableLink } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useData } from "@/hooks/use-data";
import Api from "@/lib/api";
import Cookies from "js-cookie";
import {
	CheckCircle,
	ChevronDown,
	ChevronRight,
	Clock,
	Download,
	Grid2X2,
	HardDrive,
	Loader2,
	Package,
	Table,
	User,
	XCircle,
	Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface Client {
	id: string;
	name: string;
	email: string;
	totalBackups: number;
	uniqueBackupNames: number;
	totalSize: string;
	lastBackupDate: string | null;
}

interface GroupedBackup {
	backupName: string;
	totalBackups: number;
	totalSize: string;
	latestBackup: {
		id: string;
		version: number;
		status: string;
		createdAt: string;
		filesCount: number;
		totalSize: string;
	} | null;
}

interface BackupDetail {
	id: string;
	backupName: string;
	version: number;
	status: string;
	filesCount: number;
	totalSize: string;
	createdAt: string;
	client: {
		id: string;
		name: string;
		email: string;
	};
}

interface BackupTableRow extends BackupDetail {
	client_name: string | React.ReactElement;
	status_badge: string | React.ReactElement;
}

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
	// Track which backupNames have a trigger request in flight (for immediate UI feedback)
	const [triggeringBackups, setTriggeringBackups] = useState<Set<string>>(
		new Set(),
	);
	// WebSocket connection to /frontend-ws for live backup status updates
	const wsRef = useRef<WebSocket | null>(null);
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

	function formatBytes(bytes: number | bigint | string): string {
		let b: number;
		if (typeof bytes === "string") {
			b = Number(bytes);
		} else if (typeof bytes === "bigint") {
			b = Number(bytes);
		} else {
			b = bytes;
		}
		if (b === 0) return "0 Bytes";
		const k = 1024;
		const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
		const i = Math.floor(Math.log(b) / Math.log(k));
		return `${Math.round((b / k ** i) * 100) / 100} ${sizes[i]}`;
	}

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

	// Trigger an immediate backup for a specific backup name on the selected client
	async function triggerBackup(backupName: string) {
		if (!selectedClient) return;
		setTriggeringBackups((prev) => new Set(prev).add(backupName));
		try {
			await Api.post(
				"/api/backup/trigger",
				{ clientId: selectedClient, backupName },
				{ token: Cookies.get("token") },
			);
			// WS already updated the status; do a quiet re-fetch to sync the full entry
			fetchGroupedBackupsQuietly(selectedClient);
		} catch (error: unknown) {
			const message =
				error instanceof Error ? error.message : "Failed to trigger backup";
			switch (message) {
				case "Request failed with status 503":
					toast.error(
						"Client is unavailable. This feature requires a newer version of the Backupr client to be running and connected.",
					);
					break;
				default:
					toast.error(message);
					break;
			}
		} finally {
			setTriggeringBackups((prev) => {
				const next = new Set(prev);
				next.delete(backupName);
				return next;
			});
		}
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

	// Connect to /frontend-ws when a client is selected; disconnect on leave
	useEffect(() => {
		if (!selectedClient) {
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
			}
			return;
		}

		let ws: WebSocket;
		let cancelled = false;

		// Ensure the WS server is initialised (Pages Router handler) before connecting
		fetch("/api/ws")
			.catch(() => {})
			.then(() => {
				if (cancelled) return;

				const token = Cookies.get("token");
				const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
				ws = new WebSocket(
					`${protocol}//${window.location.host}/frontend-ws?token=${token}`,
				);
				wsRef.current = ws;

				ws.onopen = () => {
					ws.send(
						JSON.stringify({ type: "subscribe", clientId: selectedClient }),
					);
				};

				ws.onmessage = (event) => {
					let msg: {
						type: string;
						statuses?: { backupName: string; status: string }[];
						backupName?: string;
						status?: string;
					};
					try {
						msg = JSON.parse(event.data);
					} catch {
						return;
					}

					if (msg.type === "backup-statuses" && msg.statuses) {
						// Initial state on subscribe – mark in-progress ones immediately
						const inProgressNames = new Set(
							msg.statuses
								.filter((s) => s.status === "in_progress")
								.map((s) => s.backupName),
						);
						if (inProgressNames.size > 0) {
							setGroupedBackups((prev) =>
								prev.map((b) =>
									inProgressNames.has(b.backupName) && b.latestBackup
										? {
												...b,
												latestBackup: {
													...b.latestBackup,
													status: "in_progress",
												},
											}
										: b,
								),
							);
							setTriggeringBackups(inProgressNames);
						}
					} else if (
						msg.type === "backup-status-update" &&
						msg.backupName &&
						msg.status
					) {
						const { backupName, status } = msg as {
							backupName: string;
							status: string;
						};
						// Update the status in-place for the matching grouped backup
						setGroupedBackups((prev) =>
							prev.map((b) =>
								b.backupName === backupName && b.latestBackup
									? { ...b, latestBackup: { ...b.latestBackup, status } }
									: b,
							),
						);
						if (status === "in_progress") {
							setTriggeringBackups((prev) => new Set(prev).add(backupName));
						} else {
							setTriggeringBackups((prev) => {
								const next = new Set(prev);
								next.delete(backupName);
								return next;
							});
							if (status === "completed") {
								toast.success(`Backup "${backupName}" finalizado!`);
							} else if (status === "failed") {
								toast.error(`Backup "${backupName}" falhou.`);
							}
							// Re-fetch to get updated version, size, and timestamp
							fetchGroupedBackupsQuietly(selectedClient);
						}
					}
				};

				ws.onerror = (err) => {
					console.error("[frontend-ws] error:", err);
				};
			});

		return () => {
			cancelled = true;
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedClient]);

	const renderStatusBadge = (status: string) => {
		switch (status) {
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
				return status;
		}
	};

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
							<div className="text-muted-foreground">Carregando...</div>
						</div>
					) : (
						<>
							{/* Clients Grid */}
							{!selectedClient && (
								<div className="space-y-4">
									<h2 className="text-2xl font-bold flex items-center gap-2">
										<User className="h-6 w-6" />
										Clientes
									</h2>
									<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
										{clients.map((client) => (
											<Card
												key={client.id}
												className="cursor-pointer hover:border-primary transition-colors"
												onClick={() => fetchGroupedBackups(client.id)}
											>
												<CardHeader>
													<CardTitle className="flex items-center justify-between">
														<span className="truncate">{client.name}</span>
														<ChevronRight className="h-5 w-5 shrink-0" />
													</CardTitle>
													<CardDescription className="truncate">
														{client.email}
													</CardDescription>
												</CardHeader>
												<CardContent>
													<div className="flex flex-col gap-2 text-sm">
														<div className="flex justify-between">
															<span className="text-muted-foreground">
																Total de Backups:
															</span>
															<span className="font-semibold">
																{client.totalBackups}
															</span>
														</div>
														<div className="flex justify-between">
															<span className="text-muted-foreground">
																Backups Únicos:
															</span>
															<span className="font-semibold">
																{client.uniqueBackupNames}
															</span>
														</div>
														<div className="flex justify-between">
															<span className="text-muted-foreground">
																Tamanho Total:
															</span>
															<span className="font-semibold">
																{formatBytes(client.totalSize)}
															</span>
														</div>
														{client.lastBackupDate && (
															<div className="flex justify-between">
																<span className="text-muted-foreground">
																	Último Backup:
																</span>
																<span
																	className={`font-semibold ${
																		new Date(client.lastBackupDate).getTime() <
																		Date.now() - 2 * 24 * 60 * 60 * 1000
																			? "text-orange-300"
																			: ""
																	}`}
																>
																	{new Date(
																		client.lastBackupDate,
																	).toLocaleString()}
																</span>
															</div>
														)}
													</div>
												</CardContent>
											</Card>
										))}
									</div>
								</div>
							)}

							{/* Grouped Backups */}
							{selectedClient && !selectedBackupName && (
								<div className="space-y-4">
									<div className="flex items-center gap-4">
										<Button
											variant="outline"
											size="sm"
											onClick={() => {
												setSelectedClient(null);
												setGroupedBackups([]);
											}}
										>
											<ChevronDown className="h-4 w-4 rotate-90" />
											Voltar
										</Button>
										<h2 className="text-2xl font-bold flex items-center gap-2">
											<Package className="h-6 w-6" />
											Backups
										</h2>
									</div>
									<div className="grid grid-cols-1 gap-4">
										{groupedBackups.map((backup) => (
											<Card
												key={backup.backupName}
												className={`cursor-pointer hover:border-primary transition-colors ${
													triggeringBackups.has(backup.backupName) ||
													backup.latestBackup?.status === "in_progress"
														? "bg-progress"
														: ""
												}`}
												onClick={() =>
													fetchBackupDetails(selectedClient, backup.backupName)
												}
											>
												<CardHeader>
													<CardTitle className="flex items-center justify-between">
														<span className="truncate">
															{backup.backupName}
														</span>
														<ChevronRight className="h-5 w-5 shrink-0" />
													</CardTitle>
													{backup.latestBackup && (
														<CardDescription>
															Último backup:{" "}
															<span
																className={`${
																	new Date(
																		backup.latestBackup.createdAt,
																	).getTime() <
																	Date.now() - 2 * 24 * 60 * 60 * 1000
																		? "text-orange-300"
																		: ""
																}`}
															>
																{new Date(
																	backup.latestBackup.createdAt,
																).toLocaleString()}
															</span>
														</CardDescription>
													)}
												</CardHeader>
												<CardContent>
													<div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
														<div className="flex flex-col">
															<span className="text-muted-foreground">
																Total de Versões
															</span>
															<span className="font-semibold text-lg">
																{backup.totalBackups}
															</span>
														</div>
														<div className="flex flex-col">
															<span className="text-muted-foreground">
																Tamanho Total
															</span>
															<span className="font-semibold text-lg">
																{formatBytes(backup.totalSize)}
															</span>
														</div>
														{backup.latestBackup && (
															<div className="flex flex-col">
																<span className="text-muted-foreground">
																	Última Versão
																</span>
																<div className="flex items-center gap-2">
																	<span className="font-semibold text-lg">
																		v{backup.latestBackup.version}
																	</span>
																	{renderStatusBadge(
																		backup.latestBackup.status,
																	)}
																</div>
															</div>
														)}
													</div>
													{/* Backup Now button – stops card click propagation */}
													<Button
														variant="outline"
														size="sm"
														className={`mt-3 w-full `}
														disabled={
															triggeringBackups.has(backup.backupName) ||
															backup.latestBackup?.status === "in_progress"
														}
														onClick={(e) => {
															e.stopPropagation();
															triggerBackup(backup.backupName);
														}}
													>
														{triggeringBackups.has(backup.backupName) ||
														backup.latestBackup?.status === "in_progress" ? (
															<>
																<Loader2 className="h-4 w-4 mr-2 animate-spin" />
																Backup em andamento…
															</>
														) : (
															<>
																<Zap className="h-4 w-4 mr-2" />
																Backup Agora
															</>
														)}
													</Button>
												</CardContent>
											</Card>
										))}
									</div>
								</div>
							)}

							{/* Backup Details Grid */}
							{selectedBackupName && backupDetails.length > 0 && (
								<div className="space-y-4">
									<div className="flex items-center gap-4">
										<Button
											variant="outline"
											size="sm"
											onClick={() => {
												setSelectedBackupName(null);
												setBackupDetails([]);
											}}
										>
											<ChevronDown className="h-4 w-4 rotate-90" />
											Voltar
										</Button>
										<h2 className="text-2xl font-bold flex items-center gap-2">
											<HardDrive className="h-6 w-6" />
											{selectedBackupName} - Versões
										</h2>
									</div>
									<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
										{backupDetails.map((backup) => (
											<Card key={backup.id}>
												<CardHeader>
													<CardTitle className="flex items-center justify-between">
														<span>Versão {backup.version}</span>
														{renderStatusBadge(backup.status)}
													</CardTitle>
													<CardDescription>
														<p>{new Date(backup.createdAt).toLocaleString()}</p>
													</CardDescription>
												</CardHeader>
												<CardContent className="space-y-4">
													<div className="flex flex-col gap-2 text-sm">
														<div className="flex justify-between">
															<span className="text-muted-foreground">
																Arquivos:
															</span>
															<span className="font-semibold">
																{backup.filesCount}
															</span>
														</div>
														<div className="flex justify-between">
															<span className="text-muted-foreground">
																Tamanho:
															</span>
															<span className="font-semibold">
																{formatBytes(backup.totalSize)}
															</span>
														</div>
													</div>
													{backup.status === "completed" && (
														<Button
															className="w-full"
															size="sm"
															onClick={() => {
																const token = Cookies.get("token");
																window.location.href = `/api/backup/${backup.id}/download?apiKey=${token}`;
															}}
														>
															<Download className="h-4 w-4 mr-2" />
															Baixar
														</Button>
													)}
												</CardContent>
											</Card>
										))}
									</div>
								</div>
							)}
						</>
					)}
				</div>
			)}
		</div>
	);
}
