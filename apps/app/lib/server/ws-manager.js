/**
 * WebSocket Manager – server-side singleton that tracks connected Electron clients
 * and coordinates on-demand backup triggers.
 *
 * We use `global.*` so that the state survives Next.js hot-module reloads in development.
 */

// Map<apiKey, WebSocket>
global._wsClients = global._wsClients || new Map();

// Map<requestId, { resolve, reject }>
global._wsPendingRequests = global._wsPendingRequests || new Map();

// Map<lockKey (`${clientId}:${backupName}`), { waiters: [{resolve, reject}] }>
global._wsActiveTriggers = global._wsActiveTriggers || new Map();

// Set<WebSocket> with metadata: ws._subscribedClientId
global._wsFrontendClients = global._wsFrontendClients || new Set();

const clients = global._wsClients;
const pendingRequests = global._wsPendingRequests;
const activeTriggers = global._wsActiveTriggers;
const frontendClients = global._wsFrontendClients;

/**
 * Register a newly connected client WebSocket.
 * Handles incoming backup-result messages and cleans up on close.
 */
function registerClient(ws, apiKey) {
	// Close any stale connection for the same apiKey
	const existing = clients.get(apiKey);
	if (existing && existing !== ws && existing.readyState === 1 /* OPEN */) {
		try {
			existing.close(1000, "Replaced by new connection");
		} catch (_) {}
	}

	clients.set(apiKey, ws);

	// Respond to client pings
	ws.on("ping", () => {
		try {
			ws.pong();
		} catch (_) {}
	});

	ws.on("close", (code, reason) => {
		console.log(
			`[WS] Client disconnected (apiKey=…${apiKey.slice(-8)}, code=${code}, reason=${reason?.toString() || ""})`,
		);
		if (clients.get(apiKey) === ws) {
			clients.delete(apiKey);
		}
	});

	ws.on("message", (data) => {
		let msg;
		try {
			msg = JSON.parse(data.toString());
		} catch {
			return;
		}

		if (msg.type === "backup-result") {
			const { requestId, success, error } = msg;
			const handler = pendingRequests.get(requestId);
			if (handler) {
				pendingRequests.delete(requestId);
				if (success) {
					handler.resolve({ success: true });
				} else {
					handler.reject(new Error(error || "Backup failed on client"));
				}
			}
		}
	});
}

/**
 * Returns true if an Electron client with the given apiKey is currently connected
 * and the WebSocket is in OPEN state.
 */
function isClientConnected(apiKey) {
	const ws = clients.get(apiKey);
	return ws != null && ws.readyState === 1; // WebSocket.OPEN = 1
}

/**
 * Send a trigger-backup request to the client identified by `apiKey`.
 *
 * Locking behaviour:
 *  - If no trigger is currently in flight for (clientId, backupName), start one.
 *  - If one is already in flight, subsequent callers are queued as "waiters" and
 *    automatically resolved/rejected when the original trigger finishes.
 *
 * The returned Promise resolves only when the client reports the backup result, so
 * callers should NOT set a short timeout on their HTTP requests.
 */
async function triggerClientBackup(apiKey, backupName, clientId) {
	const lockKey = `${clientId}:${backupName}`;

	// ── Already in progress – queue onto the existing trigger ──────────────────
	if (activeTriggers.has(lockKey)) {
		const existing = activeTriggers.get(lockKey);
		return new Promise((resolve, reject) => {
			existing.waiters.push({ resolve, reject });
		});
	}

	// ── New trigger ─────────────────────────────────────────────────────────────
	const waiters = [];
	activeTriggers.set(lockKey, { waiters });

	const requestId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

	const triggerPromise = new Promise((resolve, reject) => {
		pendingRequests.set(requestId, {
			resolve: (result) => {
				activeTriggers.delete(lockKey);
				resolve(result);
				for (const w of waiters) w.resolve(result);
			},
			reject: (err) => {
				activeTriggers.delete(lockKey);
				reject(err);
				for (const w of waiters) w.reject(err);
			},
		});
	});

	// Send the request to the client
	const ws = clients.get(apiKey);
	try {
		ws.send(JSON.stringify({ type: "trigger-backup", backupName, requestId }));
	} catch (err) {
		pendingRequests.delete(requestId);
		activeTriggers.delete(lockKey);
		throw new Error(`Failed to send trigger message to client: ${err.message}`);
	}

	return triggerPromise;
}

/**
 * Register a frontend (browser) WebSocket connection.
 * The browser sends { type: "subscribe", clientId } to receive live status
 * updates for a specific backup client.
 */
function registerFrontend(ws) {
	ws._subscribedClientId = null;
	frontendClients.add(ws);

	ws.on("message", (data) => {
		let msg;
		try {
			msg = JSON.parse(data.toString());
		} catch {
			return;
		}

		if (msg.type === "subscribe" && msg.clientId) {
			ws._subscribedClientId = msg.clientId;

			// Immediately send the current in-progress statuses for this clientId
			const inProgress = [];
			for (const lockKey of activeTriggers.keys()) {
				// lockKey is `${clientId}:${backupName}` – split on first colon only
				const colonIdx = lockKey.indexOf(":");
				const trigClientId = lockKey.slice(0, colonIdx);
				const backupName = lockKey.slice(colonIdx + 1);
				if (trigClientId === msg.clientId) {
					inProgress.push({ backupName, status: "in_progress" });
				}
			}
			try {
				ws.send(
					JSON.stringify({ type: "backup-statuses", statuses: inProgress }),
				);
			} catch (_) {}
		}
	});

	ws.on("close", () => {
		frontendClients.delete(ws);
	});

	ws.on("error", () => {
		frontendClients.delete(ws);
	});
}

/**
 * Broadcast a backup status update to all frontend clients subscribed to the
 * given clientId.
 */
function broadcastBackupStatus(clientId, backupName, status) {
	const message = JSON.stringify({
		type: "backup-status-update",
		backupName,
		status,
	});

	for (const ws of frontendClients) {
		if (ws._subscribedClientId === clientId && ws.readyState === 1 /* OPEN */) {
			try {
				ws.send(message);
			} catch (_) {}
		}
	}
}

module.exports = {
	registerClient,
	isClientConnected,
	triggerClientBackup,
	registerFrontend,
	broadcastBackupStatus,
};
