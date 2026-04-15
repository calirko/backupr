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
	const [currentStatus, setCurrentStatus] = useState<string | null>(null);
	const [backupDetails, setBackupDetails] = useState<BackupDetail[]>([]);
	const [loadingBlocks, setLoadingBlocks] = useState(false);
	const [clientStates, setClientStates] = useState<Map<string, ClientState>>(
		new Map(),
	);
	const [triggeringBackups, setTriggeringBackups] = useState<Set<string>>(
		new Set(),
	);
	/**
	 * Set of clientIds whose status icon should temporarily show red.
	 * Populated when a new lastError arrives; auto-cleared after ERROR_FLASH_MS.
	 */
	const [clientErrorFlash, setClientErrorFlash] = useState<Set<string>>(
		new Set(),
	);
	const wsRef = useRef<WebSocket | null>(null);
	/** Pending reconnect timer handle. */
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	/** How many consecutive reconnect attempts have been made (reset on open). */
	const reconnectAttemptsRef = useRef(0);
	/**
	 * Set to false in the effect's cleanup so callbacks scheduled after unmount
	 * do not touch React state or attempt new connections.
	 */
	const isMountedRef = useRef(false);
	/**
	 * Tracks the last-seen lastError.date per clientId so we can distinguish a
	 * genuinely new error from a repeated broadcast of the same one.
	 * Seeded from the initial all-client-states snapshot so pre-existing errors
	 * never trigger a flash on first load.
	 */
	const lastErrorDatesRef = useRef<Map<string, string>>(new Map());
	/** Per-client auto-clear timers for the error flash. */
	const flashTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
		new Map(),
	);
	/** How long (ms) the red error icon stays visible before reverting. */
	const ERROR_FLASH_MS = 6_000;
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
			name: "backupName",
			label: "Name",
			type: "string",
			matching: "contains",
		},
		// {
		// 	name: "status",
		// 	label: "Status",
		// 	type: "select",
		// 	matching: "equals",
		// 	options: [
		// 		{ value: "completed", label: "Completed" },
		// 		{ value: "in_progress", label: "In Progress" },
		// 		{ value: "failed", label: "Failed" },
		// 	],
		// },
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
			const backupName = currentFilters.backupName as string | undefined;
			if ((backupName as any)?.contains)
				params.set("backupName", (backupName as any)?.contains);

			const response: { clients: Client[] } = await Api.get(
				`/api/backup/clients?${params}`,
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

	async function refreshCurrentView(clientId: string) {
		try {
			if (selectedBackupName) {
				// On backup details screen — refresh the versions list
				const response: { data: BackupDetail[] } = await Api.get(
					`/api/backup/by-name?clientId=${clientId}&backupName=${encodeURIComponent(selectedBackupName)}`,
					{ token: Cookies.get("token") },
				);
				setBackupDetails(response.data);
			} else if (selectedClient) {
				// On grouped backups screen — refresh the grouped list
				const params = new URLSearchParams({ clientId });
				const response: { data: GroupedBackup[] } = await Api.get(
					`/api/backup/grouped?${params.toString()}`,
					{ token: Cookies.get("token") },
				);
				setGroupedBackups(response.data);
			} else {
				// On clients screen — refresh clients
				await fetchClients();
			}
		} catch (error) {
			console.error("Silent refresh failed:", error);
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
		isMountedRef.current = true;

		const wsServiceUrl = process.env.NEXT_PUBLIC_WS_URL;
		if (!wsServiceUrl) {
			console.error("[frontend-ws] NEXT_PUBLIC_WS_URL is not configured");
			return;
		}

		// ── Backoff helpers ───────────────────────────────────────────────────
		/** Full-jitter exponential backoff: random value in [BASE, min(BASE*2^n, MAX)]. */
		function getReconnectDelay(): number {
			const BASE = 3_000;
			const MAX = 60_000;
			const exp = Math.min(reconnectAttemptsRef.current, 7);
			const ceiling = Math.min(BASE * 2 ** exp, MAX);
			// Random value in [BASE, ceiling] avoids thundering herd after an
			// outage while still bounding the minimum wait.
			return Math.floor(BASE + Math.random() * (ceiling - BASE));
		}

		function scheduleReconnect() {
			if (!isMountedRef.current) return;
			// Guard: don't stack timers if one is already pending.
			if (reconnectTimerRef.current !== null) return;

			const delay = getReconnectDelay();
			reconnectAttemptsRef.current += 1;
			console.log(
				`[frontend-ws] reconnecting in ${Math.round(delay / 1000)}s` +
					` (attempt #${reconnectAttemptsRef.current})`,
			);
			reconnectTimerRef.current = setTimeout(() => {
				reconnectTimerRef.current = null;
				connect();
			}, delay);
		}

		// ── Connection factory ────────────────────────────────────────────────
		function connect() {
			if (!isMountedRef.current) return;

			// Re-read the token on every attempt so a refreshed token is picked up.
			const token = Cookies.get("token");
			if (!token) {
				console.warn("[frontend-ws] no auth token – will retry");
				scheduleReconnect();
				return;
			}

			let ws: WebSocket;
			try {
				ws = new WebSocket(`${wsServiceUrl}/frontend-ws?token=${token}`);
			} catch (err) {
				console.error("[frontend-ws] failed to create WebSocket:", err);
				scheduleReconnect();
				return;
			}
			wsRef.current = ws;

			ws.onopen = () => {
				if (!isMountedRef.current) {
					// Component unmounted while the handshake was in-flight.
					ws.close(1000, "Unmounted");
					return;
				}
				// Reset backoff so the next disconnect starts from the shortest delay.
				reconnectAttemptsRef.current = 0;
				ws.send(JSON.stringify({ type: "subscribe" }));
				console.log("[frontend-ws] connected");
			};

			ws.onmessage = (event) => {
				if (!isMountedRef.current) return;
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
					console.debug("[frontend-ws] message:", msg);
				} catch {
					return;
				}

				if (msg.type === "all-client-states" && msg.states) {
					const statesMap = new Map(
						Object.entries(msg.states) as [string, ClientState][],
					);
					setClientStates(statesMap);
					// Seed known error dates so pre-existing errors don't trigger a flash.
					for (const [cid, st] of statesMap) {
						if (st.lastError?.date) {
							lastErrorDatesRef.current.set(cid, st.lastError.date);
						}
					}
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
					// Flash the status icon red if a genuinely new error arrived.
					const incomingErrorDate = state.lastError?.date;
					if (
						incomingErrorDate &&
						incomingErrorDate !== lastErrorDatesRef.current.get(clientId)
					) {
						lastErrorDatesRef.current.set(clientId, incomingErrorDate);
						setClientErrorFlash((prev) => new Set(prev).add(clientId));
						// Cancel any existing flash timer for this client before starting a new one.
						const existing = flashTimersRef.current.get(clientId);
						if (existing) clearTimeout(existing);
						flashTimersRef.current.set(
							clientId,
							setTimeout(() => {
								flashTimersRef.current.delete(clientId);
								if (!isMountedRef.current) return;
								setClientErrorFlash((prev) => {
									const next = new Set(prev);
									next.delete(clientId);
									return next;
								});
							}, ERROR_FLASH_MS),
						);
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
				// The close event always fires after an error, so we let onclose
				// handle scheduling the reconnect – no double-scheduling needed.
				console.error("[frontend-ws] error:", err);
			};

			ws.onclose = (event) => {
				// Only clear the module ref if it still points to this socket
				// (a newer connect() call may have already replaced it).
				if (wsRef.current === ws) wsRef.current = null;

				if (!isMountedRef.current) return;

				console.log(
					`[frontend-ws] disconnected (code=${event.code}, clean=${event.wasClean})`,
				);
				scheduleReconnect();
			};
		}

		connect();

		// ── Cleanup ───────────────────────────────────────────────────────────
		return () => {
			isMountedRef.current = false;

			// Cancel any pending reconnect timer first.
			if (reconnectTimerRef.current !== null) {
				clearTimeout(reconnectTimerRef.current);
				reconnectTimerRef.current = null;
			}

			const ws = wsRef.current;
			if (ws) {
				// Null out onclose BEFORE calling close() so the handler doesn't
				// fire and try to schedule a reconnect for an intentional teardown.
				ws.onclose = null;
				ws.onerror = null;
				ws.onmessage = null;
				ws.close(1000, "Component unmounting");
				wsRef.current = null;
			}

			// Clear all pending error-flash timers.
			for (const timer of flashTimersRef.current.values()) {
				clearTimeout(timer);
			}
			flashTimersRef.current.clear();

			console.log("[frontend-ws] cleanup");
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
			refreshCurrentView(selectedClient);
		}

		const baseStatus = state?.connected
			? state?.activeBackup
				? state.activeBackup.status
				: "idle"
			: "disconnected";
		setCurrentStatus(baseStatus);

		prevActiveBackupForClientRef.current = current;
	}, [clientStates, selectedClient]);

	return (
		<div className="flex flex-col h-full gap-3 md:gap-4 ">
			<DataHeader
				filterFields={filterFields}
				name="backups"
				disabled={selectedClient !== null}
			>
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
									clientErrorFlash={clientErrorFlash}
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
									currentStatus={
										selectedClient && clientErrorFlash.has(selectedClient)
											? "error"
											: currentStatus
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
									currentStatus={
										selectedClient && clientErrorFlash.has(selectedClient)
											? "error"
											: currentStatus
									}
									clientName={
										clients.find((c) => c.id === selectedClient)?.name ??
										"Unknown Client"
									}
									selectedClient={selectedClient || ""}
									clientStates={clientStates}
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
