const WebSocket = require("ws");
const { URL } = require("node:url");

let ws = null;
let reconnectTimer = null;
let storeRef = null;
let mainWindowRef = null;

let isShuttingDown = false;
let connectTimeoutTimer = null;
let pingIntervalTimer = null;

const CONNECT_TIMEOUT_MS = 10_000;
const PING_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MS = 10_000;

let pongTimeout = null;

function getBackupIdByName(backupName) {
	if (!storeRef) return null;
	const syncItems = storeRef.get("syncItems", []);
	const item = syncItems.find((i) => i.name === backupName);
	return item ? item.id : null;
}

function initWsClient(store, mainWindow) {
	storeRef = store;
	mainWindowRef = mainWindow;
	isShuttingDown = false;
	_connect();
}

function reconnect() {
	if (isShuttingDown) return;
	if (ws) {
		ws.removeAllListeners("close");
		ws.close(1000, "Settings updated");
		ws = null;
	}
	_clearReconnectTimer();
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
		ws.close(1000, "App shutting down");
		ws = null;
	}
}

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

function _scheduleReconnect(delayMs = 15000) {
	if (isShuttingDown || reconnectTimer) return;
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		_connect();
	}, delayMs);
}

function _startPingInterval() {
	_clearPingInterval();
	pingIntervalTimer = setInterval(() => {
		if (!ws || ws.readyState !== WebSocket.OPEN) return;
		ws.ping();
		pongTimeout = setTimeout(() => {
			console.warn("[WS-CLIENT] Pong timeout – closing stale connection");
			ws.terminate();
		}, PING_TIMEOUT_MS);
	}, PING_INTERVAL_MS);
}

async function _connect() {
	if (isShuttingDown) return;

	const serverHost = storeRef ? storeRef.get("serverHost", "") : "";
	const wsServiceUrl = storeRef ? storeRef.get("wsServiceUrl", "") : "";
	const apiKey = storeRef ? storeRef.get("apiKey", "") : "";

	if (!apiKey) {
		_scheduleReconnect(30000);
		return;
	}

	// Resolve the WS service base URL.
	// Explicit wsServiceUrl takes priority; otherwise derive from serverHost
	// by replacing the port with 4001 (the default WS service port).
	let baseWsUrl = wsServiceUrl.trim();
	if (!baseWsUrl) {
		if (!serverHost) {
			_scheduleReconnect(30000);
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

	try {
		ws = new WebSocket(wsUrl, { rejectUnauthorized: false });
	} catch (err) {
		console.error("[WS-CLIENT] Failed to create WebSocket:", err.message);
		_scheduleReconnect();
		return;
	}

	connectTimeoutTimer = setTimeout(() => {
		connectTimeoutTimer = null;
		if (!ws || ws.readyState !== WebSocket.CONNECTING) return;
		ws.terminate();
	}, CONNECT_TIMEOUT_MS);

	ws.on("open", () => {
		_clearConnectTimeout();
		_clearReconnectTimer();
		_startPingInterval();
		broadcastWsStatus();
	});

	ws.on("pong", () => {
		if (pongTimeout) {
			clearTimeout(pongTimeout);
			pongTimeout = null;
		}
	});

	ws.on("message", async (data) => {
		let msg;
		try {
			msg = JSON.parse(data.toString());
		} catch {
			return;
		}

		if (msg.type === "trigger-backup") {
			await _handleTriggerBackup(msg);
		}
	});

	ws.on("close", (code, reason) => {
		_clearConnectTimeout();
		_clearPingInterval();
		// const reasonStr = reason?.toString() || "Unknown";

		ws = null;
		broadcastWsStatus();
		if (!isShuttingDown) {
			_scheduleReconnect();
		}
	});

	ws.on("error", (err) => {
		console.error("[WS-CLIENT] WebSocket error:", err.message);
		_clearConnectTimeout();
		_clearPingInterval();
	});
}

async function _handleTriggerBackup({ backupName }) {
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

	const { runBackup } = require("./backup");

	try {
		await runBackup(item, storeRef, (status) => {
			// Forward every status update to the server so it can broadcast to frontends
			_sendProgress(
				backupName,
				status.type,
				status.progress ?? 0,
				status.description ?? status.title ?? "",
			);
		});

		// Update syncItems with last backup time if it exists
		const syncItems = storeRef.get("syncItems", []);
		if (syncItems.length > 0) {
			const updatedItems = syncItems.map((i) =>
				i.id === item.id ? { ...i, lastBackup: new Date().toISOString() } : i,
			);
			storeRef.set("syncItems", updatedItems);

			if (mainWindowRef && !mainWindowRef.isDestroyed()) {
				mainWindowRef.webContents.send("sync-items-updated");
			}
		}
	} catch (err) {
		console.error("[WS-CLIENT] Triggered backup error:", err);
		// runBackup already sent the error status via onStatus; nothing extra needed
	} finally {
		if (mainWindowRef && !mainWindowRef.isDestroyed()) {
			mainWindowRef.webContents.send("backup-progress", {
				uploading: false,
				message: "",
				percent: 0,
			});
		}
	}
}

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

module.exports = {
	initWsClient,
	reconnect,
	shutdown,
	getBackupIdByName,
	getWsStatus: getStatus,
	sendBackupProgress: _sendProgress,
};
