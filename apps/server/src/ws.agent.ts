import { upgradeWebSocket, getConnInfo } from "hono/bun";
import { handleBackupStatusUpdate } from "./backup";
import { prisma } from "./lib/prisma";
import { BackupStatus } from "../prisma/generated/prisma/enums";
import { pushBackupUpdate } from "./ws.web";

const db = prisma;

const PING_INTERVAL_MS = 30000;
const PING_TIMEOUT_MS = 10000;

interface BackupJob {
	id: string;
	jobId?: string;
	agent_id: string;
	files: string[];
	compression_level: number;
	use_password: boolean;
	password?: string;
	is_active: boolean;
	status?: string;
	statusMessage?: string;
}

export interface AgentState {
	agentId: string;
	sessionId: string;
	status: "online" | "offline";
	lastSeen: Date;
	websocket: WebSocket;
	currentJob?: BackupJob | null;
	jobQueue?: BackupJob[];
	lastStatusReport?: {
		currentJob: BackupJob | null;
		jobQueue: BackupJob[];
		timestamp: string;
	};
}

export const agentRegistry = new Map<string, AgentState>();

/**
 * Called whenever an agent (re)connects. Finds any backups that are stuck in
 * PENDING or IN_PROGRESS for this agent's jobs and marks them FAILED so the
 * dashboard doesn't show ghost in-progress runs.
 */
async function recoverStuckBackups(agentId: string): Promise<void> {
	const stuck = await db.backup.findMany({
		where: {
			status: { in: [BackupStatus.PENDING, BackupStatus.IN_PROGRESS] },
			backup_job: { agent_id: agentId, deleted_at: null },
		},
		select: { id: true },
	});

	if (stuck.length === 0) return;

	const ids = stuck.map((b) => b.id);
	console.log(
		`[ws agent] Recovering ${stuck.length} interrupted backup(s) for agent ${agentId}: ${ids.join(", ")}`,
	);

	await db.backup.updateMany({
		where: { id: { in: ids } },
		data: {
			status: BackupStatus.FAILED,
			error: "Agent restarted: backup was interrupted",
			completed_at: new Date(),
		},
	});
}

const pendingRequests = new Map<
	string,
	(response: Record<string, unknown>) => void
>();

export function sendToAgent(
	agentId: string,
	message: Record<string, unknown>,
	timeoutMs = 30000,
): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		const state = agentRegistry.get(agentId);
		if (!state || state.status !== "online") {
			reject(new Error("Agent is offline"));
			return;
		}

		const requestId = crypto.randomUUID();
		const timer = setTimeout(() => {
			pendingRequests.delete(requestId);
			reject(new Error("Request timed out"));
		}, timeoutMs);

		pendingRequests.set(requestId, (response) => {
			clearTimeout(timer);
			resolve(response);
		});

		send(state.websocket, { ...message, requestId });
	});
}

type StatusChangeCallback = () => void;
let onStatusChange: StatusChangeCallback | null = null;
export function setOnAgentStatusChange(cb: StatusChangeCallback) {
	onStatusChange = cb;
}

type AgentConnectCallback = (agentId: string) => void;
type AgentDisconnectCallback = (agentId: string) => void;
type AgentBackupStatusCallback = (agentId: string, status: string) => void;

let onAgentConnect: AgentConnectCallback | null = null;
let onAgentDisconnect: AgentDisconnectCallback | null = null;
let onAgentBackupStatus: AgentBackupStatusCallback | null = null;

export function setOnAgentConnect(cb: AgentConnectCallback) {
	onAgentConnect = cb;
}
export function setOnAgentDisconnect(cb: AgentDisconnectCallback) {
	onAgentDisconnect = cb;
}
export function setOnAgentBackupStatus(cb: AgentBackupStatusCallback) {
	onAgentBackupStatus = cb;
}

function send(ws: WebSocket, message: Record<string, unknown>) {
	ws.send(JSON.stringify(message));
}

export default upgradeWebSocket((c) => {
	const token = c.req.query("token");
	let agentId: string | null = null;
	let sessionId: string | null = null;
	let pingIntervalId: ReturnType<typeof setInterval> | null = null;
	let pingTimeoutId: ReturnType<typeof setTimeout> | null = null;

	function clearPingTimeout() {
		if (pingTimeoutId) {
			clearTimeout(pingTimeoutId);
			pingTimeoutId = null;
		}
	}

	function startPingCycle(ws: WebSocket) {
		pingIntervalId = setInterval(() => {
			if (!agentId) return;
			send(ws, { type: "ping" });

			pingTimeoutId = setTimeout(() => {
				console.warn(
					`[ws agent] Agent ${agentId} did not respond to ping, closing.`,
				);
				ws.close();
			}, PING_TIMEOUT_MS);
		}, PING_INTERVAL_MS);
	}

	return {
		onOpen: async (_event, ws) => {
			if (!token) {
				console.warn("[ws agent] Connection rejected: missing token");
				send(ws as unknown as WebSocket, {
					type: "error",
					message: "Missing token",
				});
				ws.close();
				return;
			}

			const session = await db.agentSession.findUnique({
				where: { token },
				include: { agent: true },
			});

			if (!session) {
				console.warn("[ws agent] Connection rejected: invalid token");
				send(ws as unknown as WebSocket, {
					type: "error",
					message: "Invalid token",
				});
				ws.close();
				return;
			}

			if (session.agent.deleted_at) {
				console.warn(
					`[ws agent] Connection rejected: agent ${session.agent_id} is deleted`,
				);
				send(ws as unknown as WebSocket, {
					type: "error",
					message: "Agent has been deleted",
				});
				ws.close();
				return;
			}

			agentId = session.agent_id;
			sessionId = session.id;

			agentRegistry.set(agentId, {
				agentId,
				sessionId,
				status: "online",
				lastSeen: new Date(),
				websocket: ws as unknown as WebSocket,
			});

			const clientIp =
				c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
				c.req.header("x-real-ip") ??
				getConnInfo(c).remote.address ??
				"unknown";
			const existingInfo = (session.info as Record<string, unknown>) ?? {};
			await db.agentSession.update({
				where: { id: sessionId },
				data: {
					last_seen_at: new Date(),
					info: { ...existingInfo, ip: clientIp },
				},
			});

			console.log(
				`[ws agent] Agent connected: ${session.agent.name} (${agentId})`,
			);
			send(ws as unknown as WebSocket, {
				type: "connected",
				agentId,
				sessionId,
			});
			onStatusChange?.();
			onAgentConnect?.(agentId);

			// Auto-fix any backups left in PENDING/IN_PROGRESS from a prior crash.
			recoverStuckBackups(agentId).catch((err) =>
				console.error(
					`[ws agent] recoverStuckBackups failed for ${agentId}:`,
					err,
				),
			);

			startPingCycle(ws as unknown as WebSocket);
		},

		onMessage: async (event, _ws) => {
			if (!agentId || !sessionId) return;

			let message: Record<string, unknown>;
			try {
				message = JSON.parse(event.data.toString());
			} catch {
				console.error("[ws agent] Failed to parse message");
				return;
			}

			switch (message.type) {
				case "ping": {
					send(_ws as unknown as WebSocket, { type: "pong" });
					break;
				}

				case "pong": {
					clearPingTimeout();
					const now = new Date();
					const state = agentRegistry.get(agentId);
					if (state) {
						state.lastSeen = now;
					}
					await db.agentSession.update({
						where: { id: sessionId },
						data: { last_seen_at: now },
					});
					break;
				}

				case "agent_status": {
					const state = agentRegistry.get(agentId);
					if (state) {
						state.lastSeen = new Date();
						state.lastStatusReport = {
							currentJob: (message.currentJob as BackupJob | null) ?? null,
							jobQueue: (message.jobQueue as BackupJob[]) ?? [],
							timestamp:
								(message.timestamp as string) ?? new Date().toISOString(),
						};
						state.currentJob = state.lastStatusReport.currentJob;
						state.jobQueue = state.lastStatusReport.jobQueue;
					}
					console.log(
						`[ws agent] Status from ${agentId}: job=${state?.currentJob?.id ?? "none"}, queued=${state?.jobQueue?.length ?? 0}`,
					);
					onStatusChange?.();
					break;
				}

				case "backup_status": {
					const backupId = message.backupId as string;
					const statusStr = message.status as string;
					const metadata = message.metadata as Record<string, unknown>;

					if (!backupId || !statusStr) {
						console.warn(
							"[ws agent] backup_status message missing backupId or status",
						);
						break;
					}

					// Map agent status strings to BackupStatus enum values
					let status: string | undefined;
					switch (statusStr.toLowerCase()) {
						case "running":
							status = "IN_PROGRESS";
							break;
						case "completed":
							status = "COMPLETED";
							break;
						case "failed":
							status = "FAILED";
							break;
						default:
							console.warn(`[ws agent] Unknown backup status: ${statusStr}`);
							break;
					}

					if (!status) {
						console.warn(
							`[ws agent] Failed to map status ${statusStr} to BackupStatus`,
						);
						break;
					}

					await handleBackupStatusUpdate(backupId, status as any, {
						size_bytes: metadata?.size_bytes
							? BigInt(metadata.size_bytes as string | number)
							: undefined,
						error: metadata?.error as string | undefined,
						blob_key: metadata?.blob_key as string | undefined,
						url: metadata?.url as string | undefined,
					});

					onStatusChange?.();
					onAgentBackupStatus?.(agentId, statusStr);
					if (statusStr.toLowerCase() === "failed") pushBackupUpdate();
					break;
				}

				case "stale_backup": {
					// Agent explicitly reports a backup that was running when it was killed.
					// recoverStuckBackups already handles it via the DB scan, but this
					// path catches any timing edge-cases and is logged separately.
					const staleId = message.backupId as string;
					if (!staleId) break;
					console.log(
						`[ws agent] Agent ${agentId} reported stale backup ${staleId}`,
					);
					await db.backup.updateMany({
						where: {
							id: staleId,
							status: { in: [BackupStatus.PENDING, BackupStatus.IN_PROGRESS] },
						},
						data: {
							status: BackupStatus.FAILED,
							error:
								"Agent restarted: backup was interrupted (reported by agent)",
							completed_at: new Date(),
						},
					});
					onStatusChange?.();
					break;
				}

				case "dry_run_result":
				case "logs_data": {
					const requestId = message.requestId as string;
					const resolver = pendingRequests.get(requestId);
					if (resolver) {
						pendingRequests.delete(requestId);
						resolver(message);
					}
					break;
				}

				default:
					console.warn(`[ws agent] Unknown message type: ${message.type}`);
			}
		},

		onClose: async (_event, _ws) => {
			if (pingIntervalId) {
				clearInterval(pingIntervalId);
				pingIntervalId = null;
			}
			clearPingTimeout();

			if (agentId) {
				agentRegistry.delete(agentId);
				console.log(`[ws agent] Agent disconnected: ${agentId}`);
				onStatusChange?.();
				onAgentDisconnect?.(agentId);
			}
		},
	};
});
