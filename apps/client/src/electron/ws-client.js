const WebSocket = require("ws");
const { URL } = require("node:url");

let ws = null;
let reconnectTimer = null;
let storeRef = null;
let mainWindowRef = null;

let isShuttingDown = false;
let connectTimeoutTimer = null;
let pingIntervalTimer = null;
let pongTimeout = null;

// Reconnect backoff state
let reconnectAttempts = 0;

const CONNECT_TIMEOUT_MS = 10_000;
const PING_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MS = 10_000;

// Exponential backoff config for reconnects
const BASE_RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 60_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBackupIdByName(backupName) {
	if (!storeRef) return null;
	const syncItems = storeRef.get("syncItems", []);
	const item = syncItems.find((i) => i.name === backupName);
	return item ? item.id : null;
}

/** Compute the next reconnect delay with full-jitter exponential backoff. */
function _nextReconnectDelay() {
	// Cap the exponent so we never overflow or exceed MAX
	const exp = Math.min(reconnectAttempts, 7);
	const ceiling = Math.min(BASE_RECONNECT_DELAY_MS * 2 ** exp, MAX_RECONNECT_DELAY_MS);
	// Full-jitter: pick a random value in [0, ceiling] to spread thundering herds
	return Math.floor(Math.random() * ceiling) + BASE_RECONNECT_DELAY_MS;
}

// ── Public API ────────────────────────────────────────────────────────────────

function initWsClient(store, mainWindow) {
	storeRef = store;
	mainWindowRef = mainWindow;
	isShuttingDown = false;
	reconnectAttempts = 0;
	_connect();
}

/**
 * Force-close the current connection and immediately open a new one.
 * Intended for use when settings (API key / server URL) change.
 */
function reconnect() {
	if (isShuttingDown) return;
	reconnectAttempts = 0;
	_clearReconnectTimer();
	if (ws) {
		// Remove the close handler so it doesn't schedule another reconnect —
		// we are kicking off a fresh one right after.
		ws.removeAllListeners("close");
		ws.removeAllListeners("error");
		try {
			ws.terminate();
		} catch (_e) {}
		ws = null;
	}
	_clearConnectTimeout();
	_clearPingInterval();
	broadcastWsStatus();
	_connect();
}

/** Returns the current connection state: "connected" | "connecting" | "disconnected" */
function getStatus() {
	if (!ws) return "disconnected";
	if (ws.readyState === WebSocket.OPEN) return "connected";
	if (ws.readyState === WebSocket.CONNECTING) return "connecting";
	return "disconnected";
}

/** Push the current status to the renderer. */
function broadcastWsStatus() {
	if (
		mainWindowRef &&
		!mainWindowRef.isDestroyed() &&
		mainWindowRef.webContents
	) {
		mainWindowRef.webContents.send("ws-status", getStatus());
	}
}

function shutdown() {
	isShuttingDown = true;
	_clearConnectTimeout();
	_clearReconnectTimer();
	_clearPingInterval();
	if (ws) {
		try {
			ws.close(1000, "App shutting down");
		} catch (_e) {}
		ws = null;
	}
}

// ── Internal timer helpers ────────────────────────────────────────────────────

function _clearReconnectTimer() {
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
}

function _clearConnectTimeout() {
	if (connectTimeoutTimer) {
		clearTimeout(connectTimeoutTimer);
		connectTimeoutTimer = null;
	}
}

function _clearPingInterval() {
	if (pingIntervalTimer) {
		clearInterval(pingIntervalTimer);
		pingIntervalTimer = null;
	}
	if (pongTimeout) {
		clearTimeout(pongTimeout);
		pongTimeout = null;
	}
}

/**
 * Schedule a reconnect attempt with exponential backoff.
 *
 * Pass a `fixedDelayMs` to override the backoff (used when config is missing —
 * no point backing off aggressively there, the user just needs to fill in the
 * settings).
 */
function _scheduleReconnect(fixedDelayMs) {
	if (isShuttingDown || reconnectTimer) return;

	const delay =
		fixedDelayMs !== undefined ? fixedDelayMs : _nextReconnectDelay();

	reconnectAttempts += 1;
	console.log(
		`[WS-CLIENT] Scheduling reconnect in ${Math.round(delay / 1000)}s (attempt #${reconnectAttempts})`,
	);

	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		_connect();
	}, delay);
}

// ── Heartbeat (outgoing pings) ────────────────────────────────────────────────

/**
 * Start sending periodic pings.  If a pong is not received within
 * PING_TIMEOUT_MS the connection is considered dead and torn down.
 *
 * The server also sends its own pings every 30 s; the `ws` library responds
 * to those automatically at the protocol level, so we only need to manage
 * our outgoing side here.
 */
function _startPingInterval() {
	_clearPingInterval();

	pingIntervalTimer = setInterval(() => {
		if (!ws || ws.readyState !== WebSocket.OPEN) return;

		ws.ping();

		pongTimeout = setTimeout(() => {
			pongTimeout = null;
			console.warn("[WS-CLIENT] Pong timeout – tearing down stale connection");

			// Stop the ping loop immediately so no further pings are sent while
			// we wait for the socket's close event to propagate.
			_clearPingInterval();

			const stale = ws;
			ws = null;
			broadcastWsStatus();

			try {
				stale.terminate();
			} catch (_e) {}

			// The close event will still fire on `stale`, but its handler checks
			// `ws` (now null) and the reconnectTimer guard, so it won't
			// double-schedule.  We schedule here to be explicit.
			_scheduleReconnect();
		}, PING_TIMEOUT_MS);
	}, PING_INTERVAL_MS);
}

// ── Core connect ──────────────────────────────────────────────────────────────

async function _connect() {
	if (isShuttingDown) return;

	const serverHost = storeRef ? storeRef.get("serverHost", "") : "";
	const wsServiceUrl = storeRef ? storeRef.get("wsServiceUrl", "") : "";
	const apiKey = storeRef ? storeRef.get("apiKey", "") : "";

	// If configuration is incomplete, poll slowly until the user fills it in.
	if (!apiKey) {
		console.warn("[WS-CLIENT] No API key configured – will retry in 30 s");
		_scheduleReconnect(30_000);
		return;
	}

	// Resolve the WS service base URL.
	// Explicit wsServiceUrl takes priority; otherwise derive from serverHost
	// by replacing the port with 4001 (the default WS service port).
	//
	// We always normalise to just the *origin* (scheme + host + port) so that
	// a user who stored "http://localhost:4001/client-ws" in settings doesn't
	// end up with a doubled path like "/client-ws/client-ws".
	let baseWsUrl = wsServiceUrl.trim();
	if (baseWsUrl) {
		try {
			baseWsUrl = new URL(baseWsUrl).origin;
		} catch {
			console.error("[WS-CLIENT] Invalid wsServiceUrl:", baseWsUrl);
			baseWsUrl = "";
		}
	}

	if (!baseWsUrl) {
		if (!serverHost) {
			console.warn("[WS-CLIENT] No server host configured – will retry in 30 s");
			_scheduleReconnect(30_000);
			return;
		}
		try {
			const u = new URL(serverHost);
			u.port = "4001";
			baseWsUrl = u.origin;
		} catch {
			console.error("[WS-CLIENT] Invalid serverHost URL:", serverHost);
			_scheduleReconnect();
			return;
		}
	}

	const wsUrl = `${baseWsUrl.replace(/^http/, "ws")}/client-ws?apiKey=${encodeURIComponent(apiKey)}`;

	console.log(`[WS-CLIENT] Connecting to ${wsUrl}`);

	try {
		ws = new WebSocket(wsUrl, { rejectUnauthorized: false });
	} catch (err) {
		console.error("[WS-CLIENT] Failed to create WebSocket:", err.message);
		_scheduleReconnect();
		return;
	}

	broadcastWsStatus(); // "connecting"

	// ── Connect timeout ───────────────────────────────────────────────────────
	// Guard against a socket that never completes the handshake.
	connectTimeoutTimer = setTimeout(() => {
		connectTimeoutTimer = null;
		if (!ws || ws.readyState !== WebSocket.CONNECTING) return;
		console.warn("[WS-CLIENT] Connection timed out");
		const timedOut = ws;
		ws = null;
		broadcastWsStatus();
		try {
			timedOut.terminate();
		} catch (_e) {}
		_scheduleReconnect();
	}, CONNECT_TIMEOUT_MS);

	// ── Socket event handlers ─────────────────────────────────────────────────

	ws.on("open", () => {
		_clearConnectTimeout();
		_clearReconnectTimer();
		// Reset backoff so the next disconnect starts from the shortest delay.
		reconnectAttempts = 0;
		_startPingInterval();
		broadcastWsStatus();
		console.log("[WS-CLIENT] Connected");
	});

	// Pong received in response to one of our outgoing pings – connection is live.
	ws.on("pong", () => {
		if (pongTimeout) {
			clearTimeout(pongTimeout);
			pongTimeout = null;
		}
	});

	// The server sends ping frames; the `ws` library responds with pong
	// automatically, but we also listen explicitly so we can reset the
	// server-side heartbeat timer if needed in future.
	ws.on("ping", () => {
		// No-op: ws library auto-responds with pong.
	});

	ws.on("message", (data) => {
		let msg;
		try {
			msg = JSON.parse(data.toString());
		} catch {
			return;
		}

		if (msg.type === "trigger-backup") {
			_handleTriggerBackup(msg);
		}
	});

	ws.on("close", (code, reason) => {
		_clearConnectTimeout();
		_clearPingInterval();

		if (ws) {
			// Only null out the module-level ref if it still points to this socket.
			// (The pong-timeout path may have already replaced it.)
			ws = null;
		}

		const reasonStr = reason?.toString() || "";
		console.log(
			`[WS-CLIENT] Disconnected (code=${code}${reasonStr ? `, reason=${reasonStr}` : ""})`,
		);

		broadcastWsStatus();

		if (!isShuttingDown) {
			_scheduleReconnect();
		}
	});

	ws.on("error", (err) => {
		console.error("[WS-CLIENT] WebSocket error:", err.message);
		_clearConnectTimeout();
		_clearPingInterval();

		if (ws) {
			const errored = ws;
			ws = null;
			try {
				errored.terminate();
			} catch (_e) {}
			broadcastWsStatus();
		}

		if (!isShuttingDown) {
			_scheduleReconnect();
		}
		// The close event will still fire after terminate(); _scheduleReconnect()
		// is idempotent (guarded by reconnectTimer) so no double-scheduling.
	});
}

// ── Backup trigger handler ────────────────────────────────────────────────────

function _handleTriggerBackup({ backupName }) {
	const tasks = storeRef.get("tasks", []);
	const item = tasks.find((i) => i.name === backupName);

	if (!item) {
		_sendProgress(
			backupName,
			"error",
			0,
			`No configured backup named "${backupName}" found on this client`,
		);
		return;
	}

	// Lazy require to avoid a circular dependency:
	// schedule.js already imports sendBackupProgress from ws-client.js.
	// processBackupQueue calls sendBackupProgress automatically, so WS
	// progress reporting continues to work without any extra wiring here.
	const { queueBackup, getProcessingStatus } = require("./schedule");

	const { processing, queued } = getProcessingStatus();
	if (processing.includes(item.id) || queued.includes(item.id)) {
		console.warn(
			`[WS-CLIENT] Backup "${backupName}" is already running or queued – ignoring trigger`,
		);
		_sendProgress(
			backupName,
			"error",
			0,
			`Backup "${backupName}" is already running or queued`,
		);
		return;
	}

	console.log(`[WS-CLIENT] Queuing backup "${backupName}" via scheduler`);
	queueBackup(item);
}

// ── Progress forwarding ───────────────────────────────────────────────────────

function _sendProgress(backupName, status, progress, description) {
	if (!ws || ws.readyState !== WebSocket.OPEN) return;
	ws.send(
		JSON.stringify({
			type: "backup-progress",
			backupName,
			status,
			progress,
			description,
		}),
	);
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
	initWsClient,
	reconnect,
	shutdown,
	getBackupIdByName,
	getWsStatus: getStatus,
	sendBackupProgress: _sendProgress,
};
