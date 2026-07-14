import { upgradeWebSocket } from "hono/bun";
import { prisma } from "./lib/prisma";
import { getSchedulerQueuedJobIds } from "./scheduler";
import { agentRegistry, setOnAgentStatusChange } from "./ws.agent";

export function initAgentStatusListener() {
	setOnAgentStatusChange(() => pushAgentStatuses());
}

const db = prisma;

const PING_INTERVAL_MS = 30000;
const PING_TIMEOUT_MS = 10000;
const STATUS_BROADCAST_INTERVAL_MS = 5000;

interface WebClientState {
	clientId: string;
	userId: string;
	websocket: WebSocket;
	lastSeen: Date;
}

export const webRegistry = new Map<string, WebClientState>();

function send(ws: WebSocket, message: Record<string, unknown>) {
	ws.send(JSON.stringify(message));
}

async function buildAgentStatusPayload() {
	const agents = await db.agent.findMany({ where: { is_active: true, deleted_at: null } });

	// Resolve which agents have jobs waiting in the server-side scheduler queue
	const queuedJobIds = getSchedulerQueuedJobIds();
	const schedulerQueuedAgentIds = new Set<string>();
	if (queuedJobIds.size > 0) {
		const jobs = await db.backupJob.findMany({
			where: { id: { in: [...queuedJobIds] } },
			select: { agent_id: true },
		});
		for (const job of jobs) schedulerQueuedAgentIds.add(job.agent_id);
	}

	return agents.map((agent) => {
		const state = agentRegistry.get(agent.id);
		if (state) {
			return {
				agentId: agent.id,
				status: "connected",
				lastSeen: state.lastSeen,
				currentJob: state.currentJob ?? null,
				jobQueue: state.jobQueue ?? [],
				schedulerQueued: schedulerQueuedAgentIds.has(agent.id),
			};
		}
		return {
			agentId: agent.id,
			status: "disconnected",
			lastSeen: null,
			schedulerQueued: schedulerQueuedAgentIds.has(agent.id),
		};
	});
}

export async function pushAgentStatuses() {
	if (webRegistry.size === 0) return;
	const agents = await buildAgentStatusPayload();
	const payload = JSON.stringify({ type: "agent_statuses", agents });
	for (const client of webRegistry.values()) {
		try {
			client.websocket.send(payload);
		} catch {
			// client may have closed between registry check and send
		}
	}
}

export function pushBackupUpdate() {
	if (webRegistry.size === 0) return;
	const payload = JSON.stringify({ type: "backup_updated" });
	for (const client of webRegistry.values()) {
		try {
			client.websocket.send(payload);
		} catch {
			// ignore closed clients
		}
	}
}

export default upgradeWebSocket((c) => {
	const token = c.req.query("token");
	let clientId: string | null = null;
	let pingIntervalId: ReturnType<typeof setInterval> | null = null;
	let pingTimeoutId: ReturnType<typeof setTimeout> | null = null;
	let statusIntervalId: ReturnType<typeof setInterval> | null = null;

	function clearPingTimeout() {
		if (pingTimeoutId) {
			clearTimeout(pingTimeoutId);
			pingTimeoutId = null;
		}
	}

	function startPingCycle(ws: WebSocket) {
		pingIntervalId = setInterval(() => {
			send(ws, { type: "ping" });
			pingTimeoutId = setTimeout(() => {
				console.warn(`[ws web] Client ${clientId} did not respond to ping, closing.`);
				ws.close();
			}, PING_TIMEOUT_MS);
		}, PING_INTERVAL_MS);
	}

	async function broadcastStatus(ws: WebSocket) {
		const agents = await buildAgentStatusPayload();
		send(ws, { type: "agent_statuses", agents });
	}

	function startStatusBroadcast(ws: WebSocket) {
		broadcastStatus(ws);
		statusIntervalId = setInterval(() => broadcastStatus(ws), STATUS_BROADCAST_INTERVAL_MS);
	}

	return {
		onOpen: async (_event, ws) => {
			if (!token) {
				send(ws as unknown as WebSocket, { type: "error", message: "Missing token" });
				ws.close();
				return;
			}

			const session = await db.userSession.findUnique({
				where: { token },
				include: { user: { select: { deleted_at: true } } },
			});

			if (!session || new Date() > session.expires_at) {
				console.warn("[ws web] Connection rejected: invalid or expired token");
				send(ws as unknown as WebSocket, { type: "error", message: "Invalid or expired token" });
				ws.close();
				return;
			}

			if (session.user.deleted_at) {
				console.warn(`[ws web] Connection rejected: user ${session.user_id} is deleted`);
				send(ws as unknown as WebSocket, { type: "error", message: "Account has been deleted" });
				ws.close();
				return;
			}

			clientId = crypto.randomUUID();
			webRegistry.set(clientId, {
				clientId,
				userId: session.user_id,
				websocket: ws as unknown as WebSocket,
				lastSeen: new Date(),
			});

			console.log(`[ws web] Client connected: ${clientId} (user: ${session.user_id})`);
			send(ws as unknown as WebSocket, { type: "connected" });

			startPingCycle(ws as unknown as WebSocket);
			startStatusBroadcast(ws as unknown as WebSocket);
		},

		onMessage: async (event, _ws) => {
			if (!clientId) return;

			let message: Record<string, unknown>;
			try {
				message = JSON.parse(event.data.toString());
			} catch {
				return;
			}

			switch (message.type) {
				case "ping": {
					send(_ws as unknown as WebSocket, { type: "pong" });
					break;
				}

				case "pong": {
					clearPingTimeout();
					const state = webRegistry.get(clientId);
					if (state) state.lastSeen = new Date();
					break;
				}

				case "trigger_backup": {
					const jobId = message.jobId as string;
					if (!jobId) break;
					try {
						const { sendStartBackupCommand } = await import("./backup");
						await sendStartBackupCommand(jobId);
					} catch (error) {
						const msg = error instanceof Error ? error.message : String(error);
						console.error(`[ws web] Failed to trigger backup for job ${jobId}:`, msg);
						send(_ws as unknown as WebSocket, { type: "error", message: msg });
					}
					break;
				}

				case "subscribe":
					break;

				default:
					console.warn(`[ws web] Unknown message type: ${message.type}`);
			}
		},

		onClose: async (_event, _ws) => {
			if (pingIntervalId) clearInterval(pingIntervalId);
			if (statusIntervalId) clearInterval(statusIntervalId);
			clearPingTimeout();

			if (clientId) {
				webRegistry.delete(clientId);
				console.log(`[ws web] Client disconnected: ${clientId}`);
			}
		},
	};
});
