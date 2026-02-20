const WebSocket = require("ws");
const http = require("node:http");
const https = require("node:https");

let ws = null;
let reconnectTimer = null;
let storeRef = null;
let mainWindowRef = null;

let isShuttingDown = false;
let triggerLock = false;
let connectTimeoutTimer = null;
let pingIntervalTimer = null;

const CONNECT_TIMEOUT_MS = 10_000;
const PING_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MS = 10_000;

let pongTimeout = null;

function getBackupIdByName(backupName) {
	if (!storeRef) return null;
	const syncItems = storeRef.get("syncItems", []);
	console.log(
		`[WS-CLIENT] Looking up backup ID for name "${backupName}" in syncItems:`,
		syncItems,
	);
	const item = syncItems.find((i) => i.name === backupName);
	return item ? item.id : null;
}

function initWsClient(store, mainWindow) {
	storeRef = store;
	mainWindowRef = mainWindow;
	isShuttingDown = false;
	console.log("[WS-CLIENT] Initializing WebSocket client");
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

function _httpGet(url, timeoutMs = 8000) {
	return new Promise((resolve, reject) => {
		const mod = url.startsWith("https") ? https : http;
		const req = mod.get(url, (res) => {
			res.resume();
			res.on("end", () => resolve(res.statusCode));
		});
		req.on("error", reject);
		req.setTimeout(timeoutMs, () => {
			req.destroy(new Error(`Request to ${url} timed out`));
		});
	});
}

function _scheduleReconnect(delayMs = 15000) {
	if (isShuttingDown || reconnectTimer) return;
	console.log(`[WS-CLIENT] Reconnecting in ${delayMs / 1000}s...`);
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
	const apiKey = storeRef ? storeRef.get("apiKey", "") : "";

	if (!serverHost || !apiKey) {
		console.log(
			"[WS-CLIENT] Cannot connect: missing serverHost or apiKey. Retrying in 30s",
		);
		_scheduleReconnect(30000);
		return;
	}

	try {
		console.log("[WS-CLIENT] Priming WS server via GET /api/ws ...");
		await _httpGet(`${serverHost}/api/ws`, 8000);
	} catch (err) {
		console.error("[WS-CLIENT] Failed to reach /api/ws:", err.message);
		_scheduleReconnect();
		return;
	}

	const wsUrl = `${serverHost.replace(/^http/, "ws")}/client-ws?apiKey=${encodeURIComponent(apiKey)}`;
	console.log("[WS-CLIENT] Connecting to", wsUrl);

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
		console.warn(
			`[WS-CLIENT] Connect timeout after ${CONNECT_TIMEOUT_MS / 1000}s – terminating`,
		);
		ws.terminate();
	}, CONNECT_TIMEOUT_MS);

	ws.on("open", () => {
		console.log("[WS-CLIENT] Connected");
		_clearConnectTimeout();
		_clearReconnectTimer();
		_startPingInterval();
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
		const reasonStr = reason?.toString() || "Unknown";
		console.log(
			`[WS-CLIENT] Disconnected (code=${code} reason="${reasonStr}") – reconnecting soon`,
		);
		ws = null;
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

async function _handleTriggerBackup({ backupName, requestId }) {
	if (triggerLock) {
		_sendResult(
			requestId,
			false,
			"A triggered backup is already in progress on this client",
		);
		return;
	}
	triggerLock = true;

	try {
		const store = storeRef;
		const tasks = store.get("tasks", []);

		const item = tasks.find((i) => i.name === backupName);
		if (!item) {
			_sendResult(
				requestId,
				false,
				`No configured backup named "${backupName}" found on this client`,
			);
			return;
		}

		console.log(`[WS-CLIENT] Triggering backup: ${backupName}`);
		const { runBackup } = require("./backup");
		await runBackup(item, store);

		// Update syncItems with last backup time if it exists
		const syncItems = store.get("syncItems", []);
		if (syncItems.length > 0) {
			const updatedItems = syncItems.map((i) =>
				i.id === item.id ? { ...i, lastBackup: new Date().toISOString() } : i,
			);
			store.set("syncItems", updatedItems);

			if (mainWindowRef && !mainWindowRef.isDestroyed()) {
				mainWindowRef.webContents.send("sync-items-updated");
			}
		}

		_sendResult(requestId, true);
	} catch (err) {
		console.error("[WS-CLIENT] Triggered backup error:", err);
		_sendResult(requestId, false, err.message || "Unknown backup error");
	} finally {
		if (mainWindowRef && !mainWindowRef.isDestroyed()) {
			mainWindowRef.webContents.send("backup-progress", {
				uploading: false,
				message: "",
				percent: 0,
			});
		}
		triggerLock = false;
	}
}

function _sendResult(requestId, success, error = null) {
	if (!ws || ws.readyState !== WebSocket.OPEN) {
		console.warn("[WS-CLIENT] Cannot send result – not connected");
		return;
	}
	ws.send(
		JSON.stringify({
			type: "backup-result",
			requestId,
			success,
			error: error || undefined,
		}),
	);
}

module.exports = { initWsClient, reconnect, shutdown, getBackupIdByName };
