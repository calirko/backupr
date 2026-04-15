/**
 * Backupr – Standalone WebSocket Service
 *
 * Handles two categories of WebSocket connections:
 *
 *   /client-ws?apiKey=<key>   – Electron backup clients
 *   /frontend-ws?token=<jwt>  – Browser frontends
 *
 */

import "dotenv/config";
import { createServer } from "node:http";
import { URL } from "node:url";
import { WebSocketServer } from "ws";
import { jwtVerify } from "jose";
import { Pool } from "pg";

// ── Config ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.WS_PORT || "4001", 10);
const SECRET_TOKEN = process.env.SECRET_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

if (!SECRET_TOKEN) throw new Error("SECRET_TOKEN env var is required");
if (!DATABASE_URL) throw new Error("DATABASE_URL env var is required");

const SECRET_KEY = new TextEncoder().encode(SECRET_TOKEN);

// ── Database ──────────────────────────────────────────────────────────────────

const db = new Pool({ connectionString: DATABASE_URL });

async function findClientByApiKey(apiKey) {
	const result = await db.query(
		'SELECT id, name FROM "Client" WHERE "apiKey" = $1 LIMIT 1',
		[apiKey],
	);
	return result.rows[0] || null;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function validateToken(token) {
	try {
		await jwtVerify(token, SECRET_KEY);
		return true;
	} catch {
		return false;
	}
}

// ── State ─────────────────────────────────────────────────────────────────────

/** apiKey → WebSocket */
const electronClients = new Map();
/** apiKey → clientId */
const apiKeyToClientId = new Map();
/** clientId → ClientState */
const clientStates = new Map();
/** Set<WebSocket> */
const frontendClients = new Set();

function defaultState() {
	return {
		connected: false,
		activeBackup: null,
		lastError: null,
		lastCompleted: null,
	};
}

function patchClientState(clientId, patch) {
	const existing = clientStates.get(clientId) || defaultState();
	clientStates.set(clientId, { ...existing, ...patch });
	broadcastClientState(clientId);
}

function broadcastClientState(clientId) {
	const state = clientStates.get(clientId);
	if (!state) return;
	// console.log(`[WS] Broadcasting state update for client ${clientId}:`, state);
	const message = JSON.stringify({
		type: "client-state-update",
		clientId,
		state,
	});
	for (const ws of frontendClients) {
		if (ws.readyState === 1 /* OPEN */) {
			try {
				ws.send(message);
			} catch (_) {}
		}
	}
}

function getAllStatesSnapshot() {
	const states = {};
	for (const [cid, state] of clientStates) {
		states[cid] = state;
	}
	return states;
}

// ── Electron client handler ───────────────────────────────────────────────────

function handleElectronClient(ws, apiKey, clientId, clientName) {
	// Close any stale connection for the same key
	const existing = electronClients.get(apiKey);
	if (existing && existing !== ws && existing.readyState === 1) {
		try {
			existing.close(1000, "Replaced by new connection");
		} catch (_) {}
	}

	electronClients.set(apiKey, ws);
	apiKeyToClientId.set(apiKey, clientId);

	if (!clientStates.has(clientId)) {
		clientStates.set(clientId, defaultState());
	}
	patchClientState(clientId, { connected: true });

	console.log(
		`[WS] Electron client connected: ${clientName} (id: ${clientId})`,
	);

	// Heartbeat – detect and kill dead connections
	let isAlive = true;
	ws.on("pong", () => {
		isAlive = true;
	});
	ws.on("ping", () => {
		try {
			ws.pong();
		} catch (_) {}
	});

	const heartbeat = setInterval(() => {
		if (!isAlive) {
			console.warn(
				`[WS] Heartbeat timeout for Electron client ${clientId} – terminating dead connection`,
			);
			clearInterval(heartbeat);
			ws.terminate();
			return;
		}
		isAlive = false;
		try {
			ws.ping();
		} catch (err) {
			console.warn(
				`[WS] Failed to ping Electron client ${clientId}:`,
				err.message,
			);
			clearInterval(heartbeat);
			ws.terminate();
		}
	}, 30_000);

	ws.on("close", (code, reason) => {
		clearInterval(heartbeat);
		console.log(
			`[WS] Electron client disconnected (id=${clientId}, code=${code}, reason=${reason?.toString() || ""})`,
		);
		if (electronClients.get(apiKey) === ws) {
			electronClients.delete(apiKey);
		}
		apiKeyToClientId.delete(apiKey);
		patchClientState(clientId, { connected: false, activeBackup: null });
	});

	ws.on("message", (data) => {
		let msg;
		try {
			msg = JSON.parse(data.toString());
		} catch {
			return;
		}

		if (msg.type === "backup-progress") {
			const { backupName, status, progress, description } = msg;
			if (status === "success" || status === "completed") {
				patchClientState(clientId, {
					activeBackup: null,
					lastCompleted: { backupName, date: new Date().toISOString() },
				});
			} else if (status === "error" || status === "failed") {
				patchClientState(clientId, {
					activeBackup: null,
					lastError: {
						backupName,
						message: description || "Unknown error",
						date: new Date().toISOString(),
					},
				});
			} else {
				patchClientState(clientId, {
					activeBackup: {
						backupName,
						status,
						progress: progress ?? 0,
						description: description || "",
					},
				});
			}
		}
	});
}

// ── Frontend handler ──────────────────────────────────────────────────────────

function handleFrontend(ws) {
	frontendClients.add(ws);
	console.log(`[WS] Frontend connected (total: ${frontendClients.size})`);

	// Heartbeat – detect and kill dead connections
	let isAlive = true;
	ws.on("pong", () => {
		isAlive = true;
	});
	ws.on("ping", () => {
		try {
			ws.pong();
		} catch (_) {}
	});

	const heartbeat = setInterval(() => {
		if (!isAlive) {
			console.warn(
				`[WS] Heartbeat timeout for frontend client – terminating dead connection`,
			);
			clearInterval(heartbeat);
			ws.terminate();
			return;
		}
		isAlive = false;
		try {
			ws.ping();
		} catch (err) {
			console.warn(
				`[WS] Failed to ping frontend client:`,
				err.message,
			);
			clearInterval(heartbeat);
			ws.terminate();
		}
	}, 30_000);

	// Send full snapshot immediately
	try {
		ws.send(
			JSON.stringify({
				type: "all-client-states",
				states: getAllStatesSnapshot(),
			}),
		);
	} catch (_) {}

	ws.on("message", (data) => {
		let msg;
		try {
			msg = JSON.parse(data.toString());
		} catch {
			return;
		}

		if (msg.type === "subscribe") {
			try {
				ws.send(
					JSON.stringify({
						type: "all-client-states",
						states: getAllStatesSnapshot(),
					}),
				);
			} catch (_) {}
			return;
		}

		if (msg.type === "trigger-backup") {
			const { clientId, backupName } = msg;
			if (!clientId || !backupName) {
				try {
					ws.send(
						JSON.stringify({
							type: "trigger-error",
							clientId,
							backupName,
							error: "clientId and backupName are required",
						}),
					);
				} catch (_) {}
				return;
			}

			// Find apiKey for this clientId
			let targetApiKey = null;
			for (const [key, cid] of apiKeyToClientId) {
				if (cid === clientId) {
					targetApiKey = key;
					break;
				}
			}

			const state = clientStates.get(clientId);
			if (!state?.connected || !targetApiKey) {
				try {
					ws.send(
						JSON.stringify({
							type: "trigger-error",
							clientId,
							backupName,
							error: "Client is not connected",
						}),
					);
				} catch (_) {}
				return;
			}

			if (state.activeBackup != null) {
				try {
					ws.send(
						JSON.stringify({
							type: "trigger-error",
							clientId,
							backupName,
							error: "A backup is already in progress for this client",
						}),
					);
				} catch (_) {}
				return;
			}

			const targetWs = electronClients.get(targetApiKey);
			if (!targetWs || targetWs.readyState !== 1) {
				try {
					ws.send(
						JSON.stringify({
							type: "trigger-error",
							clientId,
							backupName,
							error: "Client WebSocket is not open",
						}),
					);
				} catch (_) {}
				return;
			}

			try {
				targetWs.send(JSON.stringify({ type: "trigger-backup", backupName }));
				console.log(
					`[WS] Triggered backup "${backupName}" for client ${clientId}`,
				);
			} catch (err) {
				try {
					ws.send(
						JSON.stringify({
							type: "trigger-error",
							clientId,
							backupName,
							error: err.message,
						}),
					);
				} catch (_) {}
			}
		}
	});

	ws.on("close", () => {
		clearInterval(heartbeat);
		frontendClients.delete(ws);
		console.log(`[WS] Frontend disconnected (total: ${frontendClients.size})`);
	});

	ws.on("error", () => {
		clearInterval(heartbeat);
		frontendClients.delete(ws);
	});
}

// ── HTTP + WS server ──────────────────────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true });

const server = createServer((req, res) => {
	if (req.method === "GET" && req.url === "/health") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(
			JSON.stringify({
				status: "ok",
				electronClients: electronClients.size,
				frontendClients: frontendClients.size,
			}),
		);
		return;
	}
	res.writeHead(404);
	res.end();
});

server.on("upgrade", async (request, socket, head) => {
	let parsed;
	try {
		parsed = new URL(request.url, `http://localhost:${PORT}`);
	} catch {
		socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
		socket.destroy();
		return;
	}

	const { pathname, searchParams } = parsed;

	// ── Electron clients ──────────────────────────────────────────────────────
	if (pathname === "/client-ws") {
		const apiKey = searchParams.get("apiKey");
		if (!apiKey) {
			socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
			socket.destroy();
			return;
		}

		let client;
		try {
			client = await findClientByApiKey(apiKey);
		} catch (err) {
			console.error("[WS] DB error during apiKey validation:", err.message);
			socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
			socket.destroy();
			return;
		}

		if (!client) {
			socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
			socket.destroy();
			return;
		}

		wss.handleUpgrade(request, socket, head, (ws) => {
			handleElectronClient(ws, apiKey, client.id, client.name);
			wss.emit("connection", ws, request);
		});
		return;
	}

	// ── Frontend browsers ─────────────────────────────────────────────────────
	if (pathname === "/frontend-ws") {
		const token = searchParams.get("token");
		if (!token) {
			socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
			socket.destroy();
			return;
		}

		const valid = await validateToken(token);
		if (!valid) {
			socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
			socket.destroy();
			return;
		}

		wss.handleUpgrade(request, socket, head, (ws) => {
			handleFrontend(ws);
			wss.emit("connection", ws, request);
		});
		return;
	}

	socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
	socket.destroy();
});

server.listen(PORT, () => {
	console.log(`[WS-SERVICE] Listening on port ${PORT}`);
	console.log(
		`[WS-SERVICE]   Electron clients → ws://host:${PORT}/client-ws?apiKey=<key>`,
	);
	console.log(
		`[WS-SERVICE]   Frontend browsers → ws://host:${PORT}/frontend-ws?token=<jwt>`,
	);
});
