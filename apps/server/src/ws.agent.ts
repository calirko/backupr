import { upgradeWebSocket, getConnInfo } from "hono/bun";
import { BackupStatus } from "../prisma/generated/prisma/enums";
import { handleBackupStatusUpdate } from "./backup";
import { prisma } from "./lib/prisma";
import { pushBackupUpdate } from "./ws.web";

const db = prisma;

const PING_INTERVAL_MS = 30000;
const PING_TIMEOUT_MS = 10000;
const STALE_TIMEOUT_MS = 5 * 60 * 1000;
const STALE_SWEEP_INTERVAL_MS = 60000;

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

/**
 * Periodic safety net: the ping/pong cycle closes sockets that stop
 * responding, but a socket that dies without a clean TCP close (network
 * drop, sleeping laptop, …) doesn't always fire onClose. Without this sweep
 * a dead entry can sit in agentRegistry forever, showing as "connected" to
 * the frontend indefinitely.
 */
function reapStaleAgents() {
	const now = Date.now();
	for (const [id, state] of agentRegistry) {
		if (now - state.lastSeen.getTime() <= STALE_TIMEOUT_MS) continue;
		console.warn(
			`[ws agent] Reaping stale agent ${id}: no activity since ${state.lastSeen.toISOString()}`,
		);
		try {
			state.websocket.close();
		} catch (err) {
			console.error(`[ws agent] Failed to close stale socket for ${id}:`, err);
		}
		agentRegistry.delete(id);
		onStatusChange?.();
		onAgentDisconnect?.(id);
	}
}

setInterval(reapStaleAgents, STALE_SWEEP_INTERVAL_MS);

/**
 * Safely convert an untrusted `size_bytes` value from an agent frame into a
 * non-negative BigInt. Returns undefined for anything that isn't a clean
 * integer (NaN, floats, garbage strings) instead of throwing.
 */
function toBigIntOrUndefined(value: unknown): bigint | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "number") {
		if (!Number.isInteger(value) || value < 0) return undefined;
		return BigInt(value);
	}
	if (typeof value === "string" && /^\d+$/.test(value.trim())) {
		try {
			return BigInt(value.trim());
		} catch {
			return undefined;
		}
	}
	return undefined;
}

function send(ws: WebSocket, message: Record<string, unknown>) {
	// The socket can be mid-close when a timer-driven send (e.g. the ping
	// interval) fires. Guard against writing to a non-open socket and swallow
	// any race where it closes between the check and the send.
	if (ws.readyState !== WebSocket.OPEN) return;
	try {
		ws.send(JSON.stringify(message));
	} catch (err) {
		console.error("[ws agent] Failed to send message:", err);
	}
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

			// If this agent already has a live connection, close the old socket
			// before replacing its registry entry. Otherwise the stale socket
			// keeps heartbeating and can still mutate DB state via late
			// agent_status/backup_status frames. The onClose race guard below
			// ensures the superseded socket won't clobber the new registry entry.
			const previous = agentRegistry.get(agentId);
			if (previous && previous.websocket !== (ws as unknown as WebSocket)) {
				console.log(
					`[ws agent] Agent ${agentId} reconnected; closing previous socket`,
				);
				try {
					previous.websocket.close();
				} catch (err) {
					console.error(
						`[ws agent] Failed to close previous socket for ${agentId}:`,
						err,
					);
				}
			}

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

			// A single malformed frame (bad BigInt, transient DB error, …) must
			// never take down the process via an unhandled rejection. Log it and
			// keep the connection alive.
			try {
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
						if (state?.currentJob || state?.jobQueue?.length) {
							console.log(
								`[ws agent] Status from ${agentId}: job=${state?.currentJob?.id ?? "none"}, queued=${state?.jobQueue?.length ?? 0}`,
							);
						}
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
							size_bytes: toBigIntOrUndefined(metadata?.size_bytes),
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
								status: {
									in: [BackupStatus.PENDING, BackupStatus.IN_PROGRESS],
								},
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

					case "update_ack": {
						console.log(
							`[ws agent] Agent ${agentId} acknowledged update command`,
						);
						break;
					}

					case "update_failed": {
						const reason = (message.reason as string) ?? "unknown";
						console.warn(
							`[ws agent] Agent ${agentId} update failed/declined: ${reason}`,
						);
						break;
					}

					default:
						console.warn(`[ws agent] Unknown message type: ${message.type}`);
				}
			} catch (err) {
				console.error(
					`[ws agent] Error handling ${String(message.type)} from ${agentId}:`,
					err,
				);
			}
		},

		onClose: async (_event, ws) => {
			if (pingIntervalId) {
				clearInterval(pingIntervalId);
				pingIntervalId = null;
			}
			clearPingTimeout();

			if (agentId) {
				// A newer connection for the same agentId may have already replaced
				// this entry (brief reconnect race, or the same agent token in use
				// from two places at once). Only remove it if it's still ours -
				// otherwise we'd delete the live connection out from under it and
				// make it invisible to command dispatch (sendToAgent) while it
				// keeps happily heartbeating.
				const state = agentRegistry.get(agentId);
				const isCurrent = state?.websocket === (ws as unknown as WebSocket);
				if (isCurrent) {
					agentRegistry.delete(agentId);
					console.log(`[ws agent] Agent disconnected: ${agentId}`);
					onStatusChange?.();
					onAgentDisconnect?.(agentId);
				} else {
					console.log(
						`[ws agent] Stale connection closed for ${agentId} (already superseded by a newer connection) - registry untouched`,
					);
				}
			}
		},
	};
});
