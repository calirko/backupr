import type { Context, Hono } from "hono";
import { generateAgentCode, generateAgentToken } from "../lib/agent";
import { getLatestAgentVersion, isOutdated } from "../lib/agent-release";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { type ListSpec, parseListQuery, toOrderBy } from "../lib/query";
import { agentRateLimit, rateLimit } from "../lib/rate-limit";
import { computeUptimePct } from "../lib/uptime";
import { presignedDownloadUrl, presignedPutUrl } from "../lib/storage";
import { defined, field, HttpError, param, readJson } from "../lib/validate";
import { notifyBackupResults, STALE_AFTER_DAYS } from "../notifications";
import { enforceRetentionForJob } from "../scheduler";
import { agentRegistry, sendToAgent } from "../ws.agent";
import { pushBackupUpdate } from "../ws.web";

const db = prisma;
const SERVER_URL = process.env.SERVER_URL || "http://localhost:5174";
const DAY_MS = 24 * 60 * 60_000;
const MAX_AGENT_INFO_BYTES = 16 * 1024;

const listSpec: ListSpec = {
	filters: {
		name: "string",
		is_active: "boolean",
		"created_by.name": "string",
		created_at: "date",
	},
	sort: ["name", "is_active", "created_at", "updated_at", "created_by.name"],
};

/** Resolves the agent session from the `Authorization: Bearer <agent token>` header. */
async function requireAgentSession(c: Context) {
	const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
	if (!token) throw new HttpError(401, "Missing Authorization header");

	const session = await db.agentSession.findUnique({
		where: { token },
		include: { agent: true },
	});
	if (!session || session.agent.deleted_at) {
		throw new HttpError(401, "Invalid agent token");
	}
	return session;
}

/** Agent-reported system info: a small, flat-ish JSON object. */
function parseAgentInfo(value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new HttpError(400, "info must be an object");
	}
	if (JSON.stringify(value).length > MAX_AGENT_INFO_BYTES) {
		throw new HttpError(400, "info is too large");
	}
	return value as Record<string, unknown>;
}

export default async function agentRoutes(app: Hono) {
	// Step 1: agent calls this to get a presigned PUT URL + backup record ID
	app.post("/api/agent/upload/prepare", async (c) => {
		const session = await requireAgentSession(c);
		const json = await readJson(c);
		const backupJobId = field.string(json, "backup_job_id", { required: true })!;
		const backupId = field.string(json, "backup_id");
		const requiresPassword = field.boolean(json, "requires_password") ?? false;

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
		const session = await requireAgentSession(c);
		const json = await readJson(c);
		const backupId = field.string(json, "backup_id", { required: true })!;
		const backupJobId = field.string(json, "backup_job_id", { required: true })!;
		const key = field.string(json, "blob_key", { required: true, max: 512 })!;
		const sizeBytes = field.int(json, "size_bytes", { min: 0 });

		// The object key is derived server-side in /prepare; anything else would
		// let an agent point its backup at another agent's blob.
		if (key !== `${session.agent_id}/${backupJobId}/${backupId}`) {
			return c.json({ error: "blob_key does not match this backup" }, 400);
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

		const backup = await db.backup.findFirst({
			where: { id: backupId, backup_job_id: backupJobId },
			select: { id: true },
		});
		if (!backup) return c.json({ error: "Backup not found for this job" }, 404);

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

		pushBackupUpdate();
		notifyBackupResults([backupId]);

		// Fire-and-forget: prune this job immediately rather than waiting for the hourly sweep
		enforceRetentionForJob(backupJobId).catch((err) =>
			console.error(
				`[agent/upload] Retention enforcement failed for job ${backupJobId}:`,
				err,
			),
		);

		return c.json({
			backup_id: backupId,
			blob_key: key,
			url,
			size_bytes: updated.size_bytes?.toString() ?? null,
		});
	});

	app.get("/api/agents/:id/code", rateLimit, auth, async (c) => {
		const id = param(c, "id");
		const agent = await db.agent.findFirst({ where: { id, deleted_at: null } });
		if (!agent) return c.json({ error: "Agent not found" }, 404);

		const created_by_id = c.get("user").id;

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

	app.post("/api/agents/pair", agentRateLimit, async (c) => {
		const json = await readJson(c);
		const agentCode = field.string(json, "agentCode", { required: true })!;
		const info = json.info === undefined ? {} : parseAgentInfo(json.info);

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
			// Mark the code as used; the used_at guard makes this single-use even
			// when two pair requests race with the same code.
			const claimed = await tx.agentCode.updateMany({
				where: { id: agentCodeRecord.id, used_at: null },
				data: { used_at: new Date() },
			});
			if (claimed.count === 0) {
				throw new HttpError(401, "Code already used");
			}

			const agent = await tx.agent.findFirst({
				where: { id: agentCodeRecord.agent_id, deleted_at: null },
			});

			if (!agent) {
				throw new HttpError(404, "Associated agent not found");
			}

			// An agent is one machine: its jobs point at that machine's paths.
			// Pairing again (e.g. moving to a new server) replaces the old
			// session, otherwise both machines connect as the same agent, kick
			// each other off, and jobs land on whichever one is connected.
			await tx.agentSession.deleteMany({ where: { agent_id: agent.id } });

			// Create the session first (without token)
			const session = await tx.agentSession.create({
				data: {
					agent_id: agent.id,
					token: "", // Temporary placeholder
					info: info as object,
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

		// Drop the old machine's live socket; its reconnect then fails with
		// "Invalid token" and it unpairs itself.
		const state = agentRegistry.get(result.agent.id);
		if (state && state.sessionId !== result.sessionId) {
			state.websocket.close();
		}

		return c.json({
			message: "Pairing successful",
			agent_id: result.agent.id,
			session_id: result.sessionId,
			token: result.token,
		});
	});

	app.get("/api/agents", rateLimit, auth, async (c) => {
		const { where, sort, skip, take } = parseListQuery(c.req.query(), listSpec);
		const baseWhere = { ...where, deleted_at: null };

		const since = new Date();
		since.setDate(since.getDate() - 7);
		const staleCutoff = new Date(Date.now() - STALE_AFTER_DAYS * DAY_MS);

		const [rawData, total, absoluteTotal] = await Promise.all([
			db.agent.findMany({
				where: baseWhere,
				orderBy: toOrderBy(sort, { created_at: "desc" }),
				skip,
				take,
				include: {
					created_by: { select: { name: true } },
					backupJobs: {
						where: { deleted_at: null },
						select: {
							is_active: true,
							created_at: true,
							_count: {
								select: {
									backups: {
										where: { status: "FAILED", started_at: { gte: since } },
									},
								},
							},
							backups: {
								where: { status: "COMPLETED" },
								select: { size_bytes: true, started_at: true },
							},
						},
					},
					agentStatuses: {
						where: { date: { gte: since } },
						orderBy: { date: "asc" },
						select: { status: true, date: true },
					},
					agentSessions: {
						orderBy: { last_seen_at: "desc" },
						take: 1,
						select: { info: true },
					},
				},
			}),
			db.agent.count({ where: baseWhere }),
			db.agent.count({ where: { deleted_at: null } }),
		]);
		const latestAgentVersion = await getLatestAgentVersion();

		const agentIds = rawData.map((agent) => agent.id);
		const baselines = agentIds.length
			? await db.agentStatus.findMany({
					where: { agent_id: { in: agentIds }, date: { lt: since } },
					orderBy: [{ agent_id: "asc" }, { date: "desc" }],
					distinct: ["agent_id"],
					select: { agent_id: true, status: true, date: true },
				})
			: [];
		const baselineByAgentId = new Map(baselines.map((b) => [b.agent_id, b]));

		const data = rawData.map(
			({ backupJobs, agentStatuses, agentSessions, ...agent }) => {
				let lastBackupAt: Date | null = null;
				let totalSizeBytes = 0;
				let failed7d = 0;
				let activeJobs = 0;
				let staleJobs = 0;
				for (const job of backupJobs) {
					let jobLastSuccess: Date | null = null;
					for (const b of job.backups) {
						totalSizeBytes += Number(b.size_bytes) || 0;
						if (
							b.started_at &&
							(!jobLastSuccess || b.started_at > jobLastSuccess)
						) {
							jobLastSuccess = b.started_at;
						}
					}
					if (
						jobLastSuccess &&
						(!lastBackupAt || jobLastSuccess > lastBackupAt)
					) {
						lastBackupAt = jobLastSuccess;
					}
					failed7d += job._count.backups;
					if (job.is_active) {
						activeJobs++;
						// Same rule as the stale-jobs email
						if (
							agent.is_active &&
							(jobLastSuccess ?? job.created_at) < staleCutoff
						) {
							staleJobs++;
						}
					}
				}

				const baseline = baselineByAgentId.get(agent.id);
				const statusRecords = baseline
					? [baseline, ...agentStatuses]
					: agentStatuses;
				const uptimePct = computeUptimePct(statusRecords, since);
				const info = agentSessions[0]?.info as
					| { agent_version?: unknown }
					| undefined;
				const agentVersion =
					typeof info?.agent_version === "string" ? info.agent_version : null;

				return {
					...agent,
					total_size_bytes: totalSizeBytes,
					last_backup_at: lastBackupAt,
					uptime_pct: uptimePct,
					total_jobs: backupJobs.length,
					active_jobs: activeJobs,
					stale_jobs: staleJobs,
					failed_7d: failed7d,
					agent_version: agentVersion,
					update_available:
						agentVersion != null &&
						latestAgentVersion != null &&
						isOutdated(agentVersion, latestAgentVersion),
				};
			},
		);

		return c.json({
			data,
			total,
			absoluteTotal,
			skip,
			take,
			latest_agent_version: latestAgentVersion,
		});
	});

	// Create Agent
	app.post("/api/agents", rateLimit, auth, async (c) => {
		const json = await readJson(c);
		const name = field.string(json, "name", { required: true })!;

		const agent = await db.agent.create({
			data: { name, created_by_id: c.get("user").id },
		});
		return c.json(agent, 201);
	});

	// Update Agent
	app.patch("/api/agents/:id", rateLimit, auth, async (c) => {
		const id = param(c, "id");
		const json = await readJson(c);

		// Only these fields can be changed through this endpoint
		const agent = await db.agent.update({
			where: { id, deleted_at: null },
			data: defined({
				name: field.string(json, "name", { min: 1 }) ?? undefined,
				is_active: field.boolean(json, "is_active"),
			}),
		});
		return c.json(agent);
	});

	// Disable/Enable Agent (Toggle)
	app.patch("/api/agents/:id/toggle", rateLimit, auth, async (c) => {
		const id = param(c, "id");
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
		const id = param(c, "id");
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
		const id = param(c, "id");

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

		// If there's no record at the very start of the window (agent was in a stable
		// state that predates the window), fetch the last known record before the
		// window so the UI can render the correct baseline instead of showing a gap.
		if (records.length === 0 || records[0]!.date > since) {
			const baseline = await db.agentStatus.findFirst({
				where: { agent_id: id, date: { lt: since } },
				orderBy: { date: "desc" },
			});
			if (baseline) records.unshift(baseline);
		}

		return c.json({ agent, records });
	});

	// Get Agent Details with Sessions
	app.get("/api/agents/:id", rateLimit, auth, async (c) => {
		const id = param(c, "id");
		const agent = await db.agent.findFirst({
			where: { id, deleted_at: null },
			include: {
				agentSessions: {
					orderBy: { last_seen_at: "desc" },
					// Never send agent session tokens to the browser
					select: {
						id: true,
						agent_id: true,
						created_at: true,
						updated_at: true,
						last_seen_at: true,
						info: true,
					},
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
			const agentId = param(c, "id");
			const sessionId = param(c, "sessionId");

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
		const session = await requireAgentSession(c);
		const json = await readJson(c);
		if (json.info === undefined) return c.json({ error: "info is required" }, 400);

		// Merge new fields into the existing info so nothing is lost.
		const existing = (session.info as Record<string, unknown>) ?? {};
		const merged = parseAgentInfo({ ...existing, ...parseAgentInfo(json.info) });
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
		const id = param(c, "id");

		try {
			const response = (await sendToAgent(id, { type: "get_logs" }, 15000)) as {
				content?: string;
			};
			return c.json({ content: response.content ?? "" });
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return c.json({ error: msg }, 503);
		}
	});

	// Trigger agent auto-update
	app.post("/api/agents/:id/update", rateLimit, auth, async (c) => {
		const id = param(c, "id");

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
		const id = param(c, "id");
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
