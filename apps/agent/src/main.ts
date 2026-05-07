// agent.ts
import os from "os";
import WebSocket from "ws";
import { type AgentConfig, ConfigManager } from "./lib/config";
import { runBackupJob } from "./backup";

const RECONNECT_TIMEOUT_MS = 5000; // Start with 5 seconds
const MAX_RECONNECT_TIMEOUT_MS = 30000; // Cap at 30 seconds
const HEARTBEAT_INTERVAL_MS = 30000; // Send heartbeat every 30 seconds
const STATUS_REPORT_INTERVAL_MS = 20000; // Report status every 20 seconds

type JobStatus = "queued" | "running" | "completed" | "failed";

interface BackupJobState {
	id: string; // backup ID
	jobId: string; // backup job ID
	status: JobStatus;
	files: string[];
	compression_level: number;
	use_password: boolean;
	password?: string;
	startedAt?: Date;
	completedAt?: Date;
	error?: string;
	statusMessage?: string;
}

class BackuprAgent {
	private ws: WebSocket | null = null;
	private config!: AgentConfig;
	private heartbeatInterval?: NodeJS.Timeout;
	private reconnectTimeout?: NodeJS.Timeout;
	private statusReportInterval?: NodeJS.Timeout;
	private reconnectAttempts = 0;
	private shouldReconnect = true;
	private jobQueue: BackupJobState[] = [];
	private currentJob: BackupJobState | null = null;

	async start() {
		this.config = await ConfigManager.load();
		this.shouldReconnect = true;

		// ── State machine ────────────────────────────────────────────────────────
		//
		//  No agentCode AND no agentToken → nothing to work with, tell user & exit
		//  agentCode present, no agentToken → try to pair (may retry on failure)
		//  agentToken present → skip pairing, go straight to connect
		//
		// ────────────────────────────────────────────────────────────────────────

		if (!this.config.agentCode && !this.config.agentToken) {
			console.error(
				"\x1b[31m[Error] No agentCode found in backupr.conf. " +
					"Add the code provided by the server and restart.\x1b[0m",
			);
			process.exit(1);
		}

		if (this.config.agentCode && !this.config.agentToken) {
			// Pairing will exit the process on failure, so if we reach the line
			// after this call we know it succeeded.
			await this.attemptPairing();
		}

		// Re-read config — agentToken is now populated after a successful pairing
		// (or it was already there from a previous run).
		if (!this.config.agentToken || !this.config.serverUrl) {
			console.error(
				"\x1b[31m[Error] Agent is not fully configured " +
					"(missing agentToken or serverUrl).\x1b[0m",
			);
			process.exit(1);
		}

		this.connect();

		// Graceful shutdown
		process.on("SIGINT", () => {
			console.log("\n[Agent] Shutting down gracefully...");
			this.shouldReconnect = false;
			this.stopHeartbeat();
			this.stopStatusReporting();
			if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
			if (this.ws) {
				this.ws.close();
			}
			process.exit(0);
		});
	}

	private async attemptPairing() {
		console.log("[Pairing] Attempting to pair with server...");

		let decoded: { serverUrl: string; agentCode: string };

		try {
			decoded = JSON.parse(atob(this.config.agentCode!));

			if (!decoded.serverUrl || !decoded.agentCode) {
				throw new Error("Decoded payload is missing serverUrl or agentCode.");
			}
		} catch (error) {
			console.error(
				"\x1b[31m[Pairing] Invalid agentCode (could not decode):\x1b[0m",
				error instanceof Error ? error.message : error,
			);
			process.exit(1);
		}

		const { serverUrl, agentCode } = decoded;

		try {
			const response = await fetch(`${serverUrl}/agents/pair`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					agentCode,
					name: os.hostname(),
					info: {
						platform: os.platform(),
						arch: os.arch(),
						release: os.release(),
						cpus: os.cpus().length,
						hostname: os.hostname(),
						agent_version: "1.0.0", // TODO: get from package.json or env variable
					},
				}),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || `Server returned ${response.status}`);
			}

			if (!data.token) {
				throw new Error("Server response did not include a token.");
			}

			this.config = await ConfigManager.update({
				serverUrl,
				agentToken: data.token,
				agentCode: undefined, // remove from file; pairing is done
			});

			console.log(
				"\x1b[32m[Pairing] Success! Agent registered and token saved.\x1b[0m",
			);
		} catch (error) {
			console.error(
				"\x1b[31m[Pairing] Failed:\x1b[0m",
				error instanceof Error ? error.message : error,
			);
			// agentCode is intentionally NOT cleared here so the user can fix
			// whatever went wrong (server down, code expired, etc.) and just
			// restart the agent without editing the config file again.
			process.exit(1);
		}
	}

	private connect() {
		const wsUrl =
			`${this.config.serverUrl!.replace(/^http/, "ws")}/agent/ws` +
			`?token=${this.config.agentToken}`;

		console.log(`[Agent] Connecting to ${wsUrl}...`);
		this.ws = new WebSocket(wsUrl);

		this.ws.on("open", () => {
			console.log("\x1b[32m[Agent] Connected and authenticated.\x1b[0m");
			this.reconnectAttempts = 0;
			this.startHeartbeat();
			this.startStatusReporting();
		});

		this.ws.on("message", (data) => {
			const text = data.toString();
			try {
				const message = JSON.parse(text);
				if (message.type === "ping") {
					this.ws?.send(JSON.stringify({ type: "pong" }));
					return;
				}
				if (message.type === "connected") {
					console.log(
						`[Agent] Server acknowledged connection (session: ${message.sessionId})`,
					);
					return;
				}
				this.handleCommand(message);
			} catch (err) {
				console.error("[Agent] Failed to parse message:", err);
			}
		});

		this.ws.on("close", (code) => {
			console.log(`[Agent] Connection closed (code: ${code}).`);
			this.stopHeartbeat();
			this.stopStatusReporting();
			this.scheduleReconnect();
		});

		this.ws.on("error", (err) => {
			// "error" is always followed by "close", so reconnect is handled there
			console.error("[Agent] WebSocket error:", err.message);
		});
	}

	private startHeartbeat() {
		this.stopHeartbeat();
		console.log("[Agent] Starting heartbeat interval...");
		this.heartbeatInterval = setInterval(() => {
			if (this.ws?.readyState === WebSocket.OPEN) {
				console.log("[Agent] Sending heartbeat...");
				this.ws.send(JSON.stringify({ type: "ping" }));
			}
		}, HEARTBEAT_INTERVAL_MS);
	}

	private stopHeartbeat() {
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = undefined;
		}
	}

	private scheduleReconnect() {
		if (!this.shouldReconnect) return;

		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
		}

		const backoffMs = Math.min(
			RECONNECT_TIMEOUT_MS * Math.pow(1.5, this.reconnectAttempts),
			MAX_RECONNECT_TIMEOUT_MS,
		);
		const jitterMs = Math.random() * 1000;
		const delayMs = backoffMs + jitterMs;

		console.log(
			`[Agent] Reconnecting in ${Math.round(delayMs)}ms (attempt ${this.reconnectAttempts + 1})...`,
		);
		this.reconnectAttempts++;

		this.reconnectTimeout = setTimeout(() => {
			if (this.shouldReconnect) {
				this.connect();
			}
		}, delayMs);
	}

	private handleCommand(message: { type: string; [key: string]: unknown }) {
		switch (message.type) {
			case "start_backup":
				console.log("[Agent] Received start_backup command:", message);
				const backupJob = message.backupJob as
					| Omit<BackupJobState, "status">
					| undefined;
				if (backupJob) {
					const jobState: BackupJobState = {
						...backupJob,
						status: "queued",
					};
					this.queueBackupJob(jobState);
				}
				break;
			case "pong":
				console.log("[Agent] Received pong from server.");
				break;
			default:
				console.warn(`[Agent] Unknown message type: ${message.type}`);
		}
	}

	private queueBackupJob(job: BackupJobState) {
		this.jobQueue.push(job);
		console.log(
			`[Agent] Backup job ${job.id} queued. Queue length: ${this.jobQueue.length}`,
		);
		if (!this.currentJob) {
			this.processNextJob();
		}
	}

	private processNextJob() {
		if (this.currentJob || this.jobQueue.length === 0) {
			return;
		}

		this.currentJob = this.jobQueue.shift() || null;
		if (!this.currentJob) return;

		this.currentJob.status = "running";
		this.currentJob.startedAt = new Date();
		console.log(`[Agent] Starting backup job ${this.currentJob.id}...`);

		// Send status update to server
		this.sendBackupStatus(this.currentJob.id, "running");

		// Execute the backup
		const job = this.currentJob;
		runBackupJob(
			{
				id: job.id,
				jobId: job.jobId,
				files: job.files,
				compression_level: job.compression_level,
				use_password: job.use_password,
				password: job.password,
			},
			(message) => {
				job.statusMessage = message;
				this.reportStatus();
			},
		)
			.then(() => {
				console.log(`[Agent] Backup job ${job.id} completed successfully.`);
				job.status = "completed";
				job.completedAt = new Date();
				// The upload endpoint already marked the backup COMPLETED in the DB.
				// Send the WS message so the server runs the retention policy.
				this.sendBackupStatus(job.id, "completed");
				this.currentJob = null;
				this.processNextJob();
			})
			.catch((error) => {
				const errMsg = error instanceof Error ? error.message : String(error);
				console.error(`[Agent] Backup job ${job.id} failed:`, error);
				job.status = "failed";
				job.error = errMsg;
				job.completedAt = new Date();
				this.sendBackupStatus(job.id, "failed", errMsg);
				this.currentJob = null;
				this.processNextJob();
			});
	}

	private sendBackupStatus(
		backupId: string,
		status: "running" | "completed" | "failed",
		error?: string,
	): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			console.warn(`[Agent] Cannot send backup status: WebSocket not open`);
			return;
		}

		const message: Record<string, unknown> = {
			type: "backup_status",
			backupId,
			status,
			metadata: error ? { error } : {},
		};

		try {
			this.ws.send(JSON.stringify(message));
			console.log(`[Agent] Sent backup status: ${backupId} = ${status}`);
		} catch (err) {
			console.error("[Agent] Failed to send backup status:", err);
		}
	}

	private startStatusReporting() {
		this.stopStatusReporting();
		console.log("[Agent] Starting status reporting interval...");
		this.statusReportInterval = setInterval(() => {
			this.reportStatus();
		}, STATUS_REPORT_INTERVAL_MS);
		// Send status immediately on connection
		this.reportStatus();
	}

	private stopStatusReporting() {
		if (this.statusReportInterval) {
			clearInterval(this.statusReportInterval);
			this.statusReportInterval = undefined;
		}
	}

	private reportStatus() {
		if (this.ws?.readyState === WebSocket.OPEN) {
			const status = {
				type: "agent_status",
				currentJob: this.currentJob,
				jobQueue: this.jobQueue,
				timestamp: new Date().toISOString(),
			};
			this.ws.send(JSON.stringify(status));
			console.log("[Agent] Sent status report");
		}
	}
}

new BackuprAgent().start();
