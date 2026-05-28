import type { Hono } from "hono";
import { generateAgentCode, generateAgentToken } from "../lib/agent";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { rateLimit } from "../lib/rate-limit";
import { presignedDownloadUrl, presignedPutUrl } from "../lib/storage";
import { Token } from "../lib/token";
import { enforceRetentionForJob } from "../scheduler";
import { agentRegistry, sendToAgent } from "../ws.agent";

const db = prisma;
const SERVER_URL = process.env.SERVER_URL || "http://localhost:5174";

export default async function agentRoutes(app: Hono) {
	// Step 1: agent calls this to get a presigned PUT URL + backup record ID
	app.post("/api/agent/upload/prepare", async (c) => {
		const token =
			c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
		if (!token) return c.json({ error: "Missing Authorization header" }, 401);

		const session = await db.agentSession.findUnique({
			where: { token },
			include: { agent: true },
		});
		if (!session) return c.json({ error: "Invalid agent token" }, 401);

		let json: {
			backup_job_id?: string;
			backup_id?: string;
			requires_password?: boolean;
		};
		try {
			json = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON" }, 400);
		}

		const {
			backup_job_id: backupJobId,
			backup_id: backupId,
			requires_password: requiresPassword = false,
		} = json;
		if (!backupJobId) return c.json({ error: "backup_job_id required" }, 400);

		const job = await db.backupJob.findFirst({
			where: { id: backupJobId, agent_id: session.agent_id, deleted_at: null },
		});
		if (!job)
			return c.json({ error: "Backup job not found for this agent" }, 404);

		let backupRecord: { id: string };
		if (backupId) {
			const existing = await db.backup.findFirst({
				where: { id: backupId, backup_job_id: backupJobId },
			});
			backupRecord =
				existing ??
				(await db.backup.create({
					data: {
						backup_job_id: backupJobId,
						status: "IN_PROGRESS",
						requires_password: requiresPassword,
						started_at: new Date(),
					},
				}));
		} else {
			backupRecord = await db.backup.create({
				data: {
					backup_job_id: backupJobId,
					status: "IN_PROGRESS",
					requires_password: requiresPassword,
					started_at: new Date(),
				},
			});
		}

		const key = `${session.agent_id}/${backupJobId}/${backupRecord.id}`;
		const upload_url = await presignedPutUrl(key, 3600);

		console.log(
			`[agent/upload] Prepared backup ${backupRecord.id} for direct upload`,
		);

		return c.json({ backup_id: backupRecord.id, blob_key: key, upload_url });
	});

	// Step 2: agent calls this after the direct PUT to MinIO completes
	app.post("/api/agent/upload/complete", async (c) => {
		const token =
			c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
		if (!token) return c.json({ error: "Missing Authorization header" }, 401);

		const session = await db.agentSession.findUnique({
			where: { token },
			include: { agent: true },
		});
		if (!session) return c.json({ error: "Invalid agent token" }, 401);

		let json: {
			backup_id?: string;
			backup_job_id?: string;
			blob_key?: string;
			size_bytes?: number;
		};
		try {
			json = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON" }, 400);
		}

		const {
			backup_id: backupId,
			backup_job_id: backupJobId,
			blob_key: key,
			size_bytes: sizeBytes,
		} = json;
		if (!backupId || !backupJobId || !key) {
			return c.json(
				{ error: "backup_id, backup_job_id, and blob_key are required" },
				400,
			);
		}

		const job = await db.backupJob.findFirst({
			where: { id: backupJobId, agent_id: session.agent_id, deleted_at: null },
		});
		if (!job)
			return c.json({ error: "Backup job not found for this agent" }, 404);

		const dateStr = new Date().toISOString().slice(0, 16).replace(/:/g, "-");
		const safeName = job.name
			.toLowerCase()
			.replace(/\s+/g, "_")
			.replace(/[^a-z0-9_]/g, "");
		const filename = `${safeName}_${dateStr}.7z`;
		const url = await presignedDownloadUrl(key, undefined, filename);

		const updated = await db.backup.update({
			where: { id: backupId },
			data: {
				status: "COMPLETED",
				blob_key: key,
				url,
				size_bytes: sizeBytes != null ? BigInt(sizeBytes) : undefined,
				completed_at: new Date(),
			},
		});

		console.log(
			`[agent/upload] Backup ${backupId} completed (${sizeBytes ?? "??"} bytes)`,
		);

		// Fire-and-forget: prune this job immediately rather than waiting for the hourly sweep
		enforceRetentionForJob(backupJobId).catch((err) =>
			console.error(`[agent/upload] Retention enforcement failed for job ${backupJobId}:`, err),
		);

		return c.json({
			backup_id: backupId,
			blob_key: key,
			url,
			size_bytes: updated.size_bytes?.toString() ?? null,
		});
	});

	app.get("/api/agents/:id/code", rateLimit, async (c) => {
		const id = c.req.param("id");
		const agent = await db.agent.findFirst({ where: { id, deleted_at: null } });
		if (!agent) return c.json({ error: "Agent not found" }, 404);

		const tokenPayload = await Token.verify(
			c.req.header("Authorization")?.split(" ")[1] ?? "",
		);
		const created_by_id = tokenPayload.user.id;

		const existingCode = await db.agentCode.findFirst({
			where: { agent_id: agent.id },
		});

		if (
			existingCode &&
			!existingCode.used_at &&
			existingCode.expires_at &&
			new Date() < existingCode.expires_at
		) {
			// Re-encode the existing code for display
			const encoded = btoa(
				JSON.stringify({
					serverUrl: SERVER_URL,
					agentCode: existingCode.code,
				}),
			);

			return c.json({
				agent_code: encoded,
				expires_at: existingCode.expires_at,
			});
		}

		const { code, encoded } = generateAgentCode();

		const newCode = await db.agentCode.create({
			data: {
				code, // ← Store the UUID
				agent_id: agent.id,
				created_by_id,
				expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
			},
		});

		return c.json({
			agent_code: encoded, // ← Return the Base64 wrapper
			expires_at: newCode.expires_at,
		});
	});

	app.post("/api/agents/pair", rateLimit, async (c) => {
		let json;

		try {
			json = await c.req.json();
		} catch (e) {
			return c.json({ error: "Invalid JSON" }, 400);
		}

		const { agentCode, name, info } = json;

		if (!agentCode) {
			return c.json({ error: "agentCode is required" }, 400);
		}

		const agentCodeRecord = await db.agentCode.findUnique({
			where: { code: agentCode },
			include: { agent: true },
		});

		if (!agentCodeRecord) {
			return c.json({ error: "Invalid pairing code" }, 401);
		}

		if (agentCodeRecord.used_at) {
			return c.json({ error: "Code already used" }, 401);
		}

		if (
			agentCodeRecord.expires_at &&
			new Date(agentCodeRecord.expires_at) < new Date()
		) {
			return c.json({ error: "Code expired" }, 401);
		}

		const result = await db.$transaction(async (tx) => {
			// Mark the code as used
			await tx.agentCode.update({
				where: { id: agentCodeRecord.id },
				data: { used_at: new Date() },
			});

			const agent = await tx.agent.findFirst({
				where: { id: agentCodeRecord.agent_id, deleted_at: null },
			});

			if (!agent) {
				throw new Error("Associated agent not found");
			}

			// Create the session first (without token)
			const session = await tx.agentSession.create({
				data: {
					agent_id: agent.id,
					token: "", // Temporary placeholder
					info: info ?? {},
					last_seen_at: new Date(),
				},
			});

			// Generate a session token with the session ID
			const token = generateAgentToken({
				agentName: agent.name,
				agentId: agent.id,
				sessionId: session.id,
			});

			// Update the session with the actual token
			await tx.agentSession.update({
				where: { id: session.id },
				data: { token },
			});

			return { agent, token, sessionId: session.id };
		});

		return c.json({
			message: "Pairing successful",
			agent_id: result.agent.id,
			session_id: result.sessionId,
			token: result.token,
		});
	});

	app.get("/api/agents", rateLimit, auth, async (c) => {
		const { filters, orderBy, skip, take } = c.req.query();
		const parsedFilters = filters
			? JSON.parse(decodeURIComponent(filters))
			: {};
		const parsedOrderBy = orderBy
			? JSON.parse(decodeURIComponent(orderBy))
			: {};

		const s = skip ? parseInt(skip) : undefined;
		const t = take ? parseInt(take) : undefined;

		const baseWhere = { deleted_at: null, ...parsedFilters };

		const [rawData, total, absoluteTotal] = await Promise.all([
			db.agent.findMany({
				where: baseWhere,
				orderBy: Object.keys(parsedOrderBy).length
					? parsedOrderBy
					: { created_at: "desc" },
				skip: s,
				take: t,
				include: {
					created_by: { select: { name: true } },
					backupJobs: {
						where: { deleted_at: null },
						select: {
							backups: {
								where: { status: "COMPLETED" },
								select: { size_bytes: true, started_at: true },
							},
						},
					},
				},
			}),
			db.agent.count({ where: baseWhere }),
			db.agent.count({ where: { deleted_at: null } }),
		]);

		const data = rawData.map(({ backupJobs, ...agent }) => {
			let lastBackupAt: Date | null = null;
			let totalSizeBytes = 0;
			for (const job of backupJobs) {
				for (const b of job.backups) {
					totalSizeBytes += Number(b.size_bytes) || 0;
					if (b.started_at && (!lastBackupAt || b.started_at > lastBackupAt)) {
						lastBackupAt = b.started_at;
					}
				}
			}
			return {
				...agent,
				total_size_bytes: totalSizeBytes,
				last_backup_at: lastBackupAt,
			};
		});

		return c.json({ data, total, absoluteTotal, skip: s, take: t });
	});

	// Create Agent
	app.post("/api/agents", rateLimit, async (c) => {
		let json;
		try {
			json = await c.req.json();
		} catch (e) {
			return c.json({ error: "Invalid JSON" }, 400);
		}

		const tokenPayload = await Token.verify(
			c.req.header("Authorization")?.split(" ")[1] ?? "",
		);
		const created_by_id = tokenPayload.user.id;

		const { name } = json;
		if (!name) return c.json({ error: "Name is required" }, 400);

		const agent = await db.agent.create({
			data: { name, created_by_id },
		});
		return c.json(agent, 201);
	});

	// Update Agent
	app.patch("/api/agents/:id", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		let json;
		try {
			json = await c.req.json();
		} catch (e) {
			return c.json({ error: "Invalid JSON" }, 400);
		}

		const agent = await db.agent.update({
			where: { id },
			data: json,
		});
		return c.json(agent);
	});

	// Disable/Enable Agent (Toggle)
	app.patch("/api/agents/:id/toggle", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		const agent = await db.agent.findFirst({ where: { id, deleted_at: null } });
		if (!agent) return c.json({ error: "Agent not found" }, 404);

		const updated = await db.agent.update({
			where: { id },
			data: { is_active: !agent.is_active },
		});
		return c.json(updated);
	});

	// Disable Agent
	app.post("/api/agents/:id/disable", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		const agent = await db.agent.findFirst({ where: { id, deleted_at: null } });
		if (!agent) return c.json({ error: "Agent not found" }, 404);

		const updated = await db.agent.update({
			where: { id },
			data: { is_active: false },
		});
		return c.json(updated);
	});

	// Get Agent Status History (last 7 days)
	app.get("/api/agents/:id/status", rateLimit, auth, async (c) => {
		const id = c.req.param("id");

		const agent = await db.agent.findFirst({
			where: { id, deleted_at: null },
			select: { id: true, name: true },
		});
		if (!agent) return c.json({ error: "Agent not found" }, 404);

		const since = new Date();
		since.setDate(since.getDate() - 7);

		const records = await db.agentStatus.findMany({
			where: { agent_id: id, date: { gte: since } },
			orderBy: { date: "asc" },
		});

		return c.json({ agent, records });
	});

	// Get Agent Details with Sessions
	app.get("/api/agents/:id", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		const agent = await db.agent.findFirst({
			where: { id, deleted_at: null },
			include: {
				agentSessions: {
					orderBy: { last_seen_at: "desc" },
				},
				agentCodes: {
					where: { used_at: null },
					orderBy: { created_at: "desc" },
				},
				backupJobs: {
					select: {
						id: true,

						is_active: true,
						cron: true,
					},
				},
			},
		});

		if (!agent) {
			return c.json({ error: "Agent not found" }, 404);
		}

		return c.json(agent);
	});

	// Revoke Agent Session
	app.delete(
		"/api/agents/:id/sessions/:sessionId",
		rateLimit,
		auth,
		async (c) => {
			const agentId = c.req.param("id");
			const sessionId = c.req.param("sessionId");

			const session = await db.agentSession.findFirst({
				where: { id: sessionId, agent_id: agentId },
			});
			if (!session) return c.json({ error: "Session not found" }, 404);

			await db.agentSession.delete({ where: { id: sessionId } });

			const state = agentRegistry.get(agentId);
			if (state && state.sessionId === sessionId) {
				state.websocket.close();
			}

			return c.json({ message: "Session revoked" });
		},
	);

	// Agent refreshes its own session info (version, hostname, RAM, disk, etc.).
	// Called on every reconnect and after a self-update so the dashboard stays
	// current without needing a full re-pair.
	app.patch("/api/agent/session/info", rateLimit, async (c) => {
		const token =
			c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
		if (!token) return c.json({ error: "Missing Authorization header" }, 401);

		const session = await db.agentSession.findUnique({
			where: { token },
			include: { agent: true },
		});
		if (!session) return c.json({ error: "Invalid agent token" }, 401);

		let json: { info?: Record<string, unknown> };
		try {
			json = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON" }, 400);
		}
		if (!json.info) return c.json({ error: "info is required" }, 400);

		// Merge new fields into the existing info so nothing is lost.
		const existing = (session.info as Record<string, unknown>) ?? {};
		const merged = { ...existing, ...json.info };
		await db.agentSession.update({
			where: { id: session.id },
			data: { info: merged as any }, // eslint-disable-line @typescript-eslint/no-explicit-any
		});

		console.log(
			`[agent/session] Info refreshed for session ${session.id} (agent ${session.agent_id})`,
		);
		return c.json({ message: "Session info updated" });
	});

	// Fetch agent log files
	app.get("/api/agents/:id/logs", rateLimit, auth, async (c) => {
		const id = c.req.param("id");

		try {
			const response = await sendToAgent(id, { type: "get_logs" }, 15000) as { content?: string };
			return c.json({ content: response.content ?? "" });
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return c.json({ error: msg }, 503);
		}
	});

	// Trigger agent auto-update
	app.post("/api/agents/:id/update", rateLimit, auth, async (c) => {
		const id = c.req.param("id");

		const state = agentRegistry.get(id);
		if (!state || state.status !== "online") {
			return c.json({ error: "Agent is not online" }, 409);
		}

		try {
			state.websocket.send(JSON.stringify({ type: "update" }));
			console.log(`[agent/update] Sent update command to agent ${id}`);
			return c.json({ message: "Update command sent" });
		} catch (err) {
			return c.json({ error: "Failed to send update command" }, 500);
		}
	});

	// Delete Agent
	app.delete("/api/agents/:id", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		try {
			const backupJobs = await db.backupJob.findMany({
				where: { agent_id: id, deleted_at: null },
				select: { name: true },
			});
			if (backupJobs.length > 0) {
				return c.json(
					{
						error: `This agent has ${backupJobs.length} backup job${backupJobs.length === 1 ? "" : "s"} assigned (${backupJobs.map((j) => j.name).join(", ")}). Remove all backup jobs before deleting.`,
					},
					409,
				);
			}
			await db.$transaction([
				db.agent.update({
					where: { id },
					data: { deleted_at: new Date() },
				}),
				db.agentSession.deleteMany({ where: { agent_id: id } }),
				db.agentCode.deleteMany({ where: { agent_id: id } }),
			]);
			const state = agentRegistry.get(id);
			if (state) {
				state.websocket.close();
			}
			return c.json({ message: "Agent deleted" });
		} catch (error) {
			return c.json({ error: "Failed to delete agent" }, 400);
		}
	});
}
