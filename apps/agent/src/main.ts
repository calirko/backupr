import os from "os";
import WebSocket from "ws";
import { type AgentConfig, ConfigManager } from "./lib/config";

class BackuprAgent {
	private ws: WebSocket | null = null;
	private config!: AgentConfig;
	private heartbeatInterval?: Timer;
	private reconnectTimeout?: Timer;

	async start() {
		this.config = await ConfigManager.load();

		if (!this.config.agentToken && this.config.agentCode) {
			await this.attemptPairing();
		}

		if (!this.config.agentToken || !this.config.serverUrl) {
			console.error(
				"[Error] Agent not paired. Please add agentCode to backupr.conf",
			);
			process.exit(1);
		}

		this.connect();
	}

	private async attemptPairing() {
		try {
			console.log("[Pairing] Attempting to pair with server...");

			// Decode Base64 code: expected { url, code, expires_at }
			const decoded = JSON.parse(atob(this.config.agentCode!));
			const { serverUrl, agentCode } = decoded;

			const response = await fetch(`${serverUrl}/agents/pair`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					agentCode: agentCode,
					name: os.hostname(),
					info: {
						platform: os.platform(),
						arch: os.arch(),
						release: os.release(),
						cpus: os.cpus().length,
					},
				}),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Pairing failed");
			}

			this.config = await ConfigManager.update({
				serverUrl: serverUrl,
				agentToken: data.token,
				agentCode: undefined,
			});

			console.log(
				"\x1b[32m[Pairing] Success! Agent registered and token saved.\x1b[0m",
			);
		} catch (error) {
			console.error(
				"\x1b[31m[Pairing] Failed:\x1b[0m",
				error instanceof Error ? error.message : error,
			);
			process.exit(1);
		}
	}

	private connect() {
		const wsUrl = `${this.config.serverUrl.replace("http", "ws")}/agent/ws?token=${this.config.agentToken}`;

		console.log(`[Agent] Connecting to ${wsUrl}...`);
		this.ws = new WebSocket(wsUrl);

		this.ws.on("open", () => {
			console.log("\x1b[32m[Agent] Connected and authenticated.\x1b[0m");
			this.startHeartbeat();
		});

		this.ws.on("message", (data) => {
			if (data.toString() === "pong") return;
			this.handleCommand(data.toString());
		});

		this.ws.on("close", (code) => {
			console.log(`[Agent] Connection closed (Code: ${code}).`);
			this.stopHeartbeat();
			this.scheduleReconnect();
		});

		this.ws.on("error", (err) => {
			console.error("[Agent] WebSocket Error:", err.message);
		});
	}

	private startHeartbeat() {
		this.stopHeartbeat();
		this.heartbeatInterval = setInterval(() => {
			if (this.ws?.readyState === WebSocket.OPEN) {
				this.ws.send("ping");
			}
		}, 30000);
	}

	private stopHeartbeat() {
		if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
	}

	private scheduleReconnect() {
		if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
		this.reconnectTimeout = setTimeout(() => this.connect(), 5000);
	}

	private handleCommand(message: string) {
		// Command logic...
	}
}

new BackuprAgent().start();
