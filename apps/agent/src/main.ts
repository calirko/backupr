// agent.ts

import * as fs from "fs";
import WebSocket from "ws";
import { runBackupJob } from "./backup";
import { type AgentConfig, ConfigManager } from "./lib/config";
import { runSetup } from "./setup";

const [, , subcommand, subcommandArg] = process.argv;

if (subcommand === "setup") {
	if (!subcommandArg) {
		console.error("\x1b[31m[Setup] Usage: agent setup <agentCode>\x1b[0m");
		process.exit(1);
	}
	await runSetup(subcommandArg);
	process.exit(0);
}

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

		if (
			!this.config.agentToken ||
			!this.config.serverUrl ||
			!this.config.wsUrl
		) {
			console.error(
				"\x1b[31m[Error] Agent is not configured. Run: agent setup <agentCode>\x1b[0m",
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

	private connect() {
		const wsBase =
			this.config.wsUrl ?? this.config.serverUrl!.replace(/^http/, "ws");
		const wsUrl = `${wsBase}/api/agent/ws?token=${this.config.agentToken}`;

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
			case "dry_run":
				this.handleDryRun(message);
				break;
			case "pong":
				console.log("[Agent] Received pong from server.");
				break;
			default:
				console.warn(`[Agent] Unknown message type: ${message.type}`);
		}
	}

	private handleDryRun(message: { type: string; [key: string]: unknown }) {
		const requestId = message.requestId as string;
		const paths = (message.files as string[]) ?? [];
		const compressionLevel = (message.compression_level as number) ?? 5;

		console.log(
			`[Agent] Received dry_run request (${requestId}) for ${paths.length} path(s):`,
			paths,
		);

		// Per-level compression ratio estimates (compressed_size / original_size)
		// These are conservative estimates based on typical file mixes
		const compressionRatios: Record<number, number> = {
			1: 0.7, // Very low: ~70% of original
			2: 0.65, // Low: ~65%
			3: 0.6, // Medium-low: ~60%
			4: 0.55, // Medium: ~55%
			5: 0.5, // Medium (default): ~50%
			6: 0.45, // Medium-high: ~45%
			7: 0.4, // High: ~40%
			8: 0.35, // Very high: ~35%
			9: 0.3, // Ultra: ~30%
		};

		const compressionRatio =
			compressionRatios[compressionLevel] ?? compressionRatios[5];

		interface PathResult {
			path: string;
			exists: boolean;
			readable: boolean;
			type: "file" | "directory" | "unknown";
			size_bytes: number;
			error?: string;
		}

		const getDirSize = (dir: string): number => {
			let total = 0;
			try {
				for (const entry of fs.readdirSync(dir)) {
					const full = `${dir}/${entry}`;
					try {
						const s = fs.statSync(full);
						total += s.isDirectory() ? getDirSize(full) : s.size;
					} catch {
						// skip unreadable entries
					}
				}
			} catch {
				// skip unreadable dir
			}
			return total;
		};

		const pathResults: PathResult[] = [];
		let totalBytes = 0;

		for (const p of paths) {
			const result: PathResult = {
				path: p,
				exists: false,
				readable: false,
				type: "unknown",
				size_bytes: 0,
			};

			try {
				const stat = fs.statSync(p);
				result.exists = true;
				result.type = stat.isDirectory() ? "directory" : "file";

				fs.accessSync(p, fs.constants.R_OK);
				result.readable = true;

				result.size_bytes = stat.isDirectory() ? getDirSize(p) : stat.size;
				totalBytes += result.size_bytes;
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				if (!result.exists) {
					result.error = "Path does not exist";
				} else {
					result.error = `Not readable: ${msg}`;
				}
			}

			pathResults.push(result);
			console.log(
				`[Agent] dry_run path "${p}": exists=${result.exists} readable=${result.readable} type=${result.type} size=${result.size_bytes}B${result.error ? ` error="${result.error}"` : ""}`,
			);
		}

		const reachablePaths = pathResults.filter((r) => r.exists && r.readable);

		// Calculate storage required: original + copy + compressed
		// During backup: original files + temp copy + archive all exist on disk simultaneously
		const compressedEstimate = Math.ceil(totalBytes * compressionRatio);
		const storageRequired = totalBytes + totalBytes + compressedEstimate; // original + copy + compressed

		const response = {
			type: "dry_run_result",
			requestId,
			files_found: reachablePaths.length > 0,
			file_count: reachablePaths.length,
			files: reachablePaths.map((r) => r.path),
			storage_required: storageRequired,
			path_results: pathResults,
		};

		console.log(
			`[Agent] Sending dry_run_result (${requestId}): ${reachablePaths.length}/${paths.length} paths reachable, original=${totalBytes}B, copy=${totalBytes}B, compressed_est=${compressedEstimate}B, storage_required=${storageRequired}B`,
		);

		this.ws?.send(JSON.stringify(response));
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
