import type { Hono } from "hono";
import { generateAgentCode, generateAgentToken } from "../lib/agent";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { rateLimit } from "../lib/rate-limit";
import { presignedDownloadUrl, uploadStream } from "../lib/storage";
import { Token } from "../lib/token";
import { agentRegistry } from "../ws.agent";

const db = prisma;
const SERVER_URL = process.env.SERVER_URL || "http://localhost:5174";

export default async function agentRoutes(app: Hono) {
	app.post("/api/agent/upload", async (c) => {
		// Auth: agent session token
		const token =
			c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
		if (!token) return c.json({ error: "Missing Authorization header" }, 401);

		const session = await db.agentSession.findUnique({
			where: { token },
			include: { agent: true },
		});
		if (!session) return c.json({ error: "Invalid agent token" }, 401);

		const backupJobId = c.req.header("X-Backup-Job-Id");
		if (!backupJobId)
			return c.json({ error: "Missing X-Backup-Job-Id header" }, 400);

		const backupId = c.req.header("X-Backup-Id");

		const job = await db.backupJob.findFirst({
			where: { id: backupJobId, agent_id: session.agent_id, deleted_at: null },
		});
		if (!job)
			return c.json({ error: "Backup job not found for this agent" }, 404);

		const rawContentLength = c.req.header("Content-Length");
		const size = rawContentLength ? parseInt(rawContentLength) : undefined;
		const requiresPassword = c.req.header("X-Requires-Password") === "true";
		const contentType =
			c.req.header("Content-Type") ?? "application/octet-stream";

		// Reuse the existing backup record created by the WS command flow, or create one
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

		try {
			const body = c.req.raw.body;
			if (!body) {
				await db.backup.update({
					where: { id: backupRecord.id },
					data: {
						status: "FAILED",
						error: "Empty request body",
						completed_at: new Date(),
					},
				});
				return c.json({ error: "Empty request body" }, 400);
			}

			const { Readable } = await import("node:stream");
			const nodeStream = Readable.fromWeb(body as any);
			await uploadStream(key, nodeStream, size, contentType);

			const filename = `${job.name}.7z`;
			const url = await presignedDownloadUrl(key, undefined, filename);

			const updated = await db.backup.update({
				where: { id: backupRecord.id },
				data: {
					status: "COMPLETED",
					blob_key: key,
					url,
					size_bytes: size != null ? BigInt(size) : undefined,
					completed_at: new Date(),
				},
			});

			console.log(
				`[agent/upload] Backup ${backupRecord.id} uploaded successfully (${size ?? "??"} bytes)`,
			);

			return c.json({
				backup_id: backupRecord.id,
				blob_key: key,
				url,
				size_bytes: updated.size_bytes?.toString() ?? null,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Upload failed";
			console.error("[agent/upload] Error:", message);
			await db.backup.update({
				where: { id: backupRecord.id },
				data: { status: "FAILED", error: message, completed_at: new Date() },
			});
			return c.json({ error: "Upload failed", detail: message }, 500);
		}
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
								select: { size_bytes: true },
							},
						},
					},
				},
			}),
			db.agent.count({ where: baseWhere }),
			db.agent.count({ where: { deleted_at: null } }),
		]);

		const data = rawData.map(({ backupJobs, ...agent }) => ({
			...agent,
			total_size_bytes: backupJobs.reduce(
				(sum, job) =>
					sum +
					job.backups.reduce((s, b) => s + (Number(b.size_bytes) || 0), 0),
				0,
			),
		}));

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
	app.delete("/api/agents/:id/sessions/:sessionId", rateLimit, auth, async (c) => {
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
	});

	// Delete Agent
	app.delete("/api/agents/:id", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		await db.agent.update({
			where: { id },
			data: { deleted_at: new Date() },
		});
		return c.json({ message: "Agent deleted" });
	});
}
