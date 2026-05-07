import type { Hono } from "hono";
import { generateAgentCode, generateAgentToken } from "./lib/agent";
import { auth } from "./lib/auth";
import { Password } from "./lib/password";
import { prisma } from "./lib/prisma";
import { rateLimit } from "./lib/rate-limit";
import { presignedDownloadUrl, uploadStream } from "./lib/storage";
import { Token, type TokenPayload } from "./lib/token";

const db = prisma;
const SERVER_URL = process.env.SERVER_URL || "http://localhost:5174";

export default async function setupRoutes(app: Hono) {
	app.get("/ping", (c) => {
		return c.json({ message: "pong" });
	});

	// user
	app.post("auth/login", rateLimit, async (c) => {
		let json;
		try {
			json = await c.req.json();
		} catch (e) {
			return c.json({ error: "Invalid or missing JSON body" }, 400);
		}

		const { emailOrUsername, password } = json ?? {};
		if (!emailOrUsername || !password) {
			return c.json(
				{
					error: "Username/email and password are required",
				},
				400,
			);
		}

		// Try to find user by email first, then by name (username)
		let user = await db.user.findUnique({ where: { email: emailOrUsername } });
		if (!user) {
			user = await db.user.findFirst({
				where: { username: emailOrUsername },
			});
		}
		if (!user || !(await Password.compare(password, user.password))) {
			return c.json({ error: "Invalid credentials" }, 401);
		}

		// 1. Calculate timestamps in SECONDS (JWT Standard)
		const iat = Token.nowInSeconds();
		const exp = Token.expiresAtSeconds();

		const payload: TokenPayload = {
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
			},
			exp: exp,
			iat: iat,
			nbf: iat,
			iss: "backupr",
		};

		const generatedToken = await Token.generate(payload);

		// 2. Create session in DB
		// We convert the 'exp' (seconds) to a Date object for Prisma
		await db.userSession.create({
			data: {
				token: generatedToken,
				user_id: user.id,
				expires_at: Token.secondsToDate(exp),
			},
		});

		return c.json({
			message: "Login successful",
			token: generatedToken,
		});
	});

	app.get("auth/me", rateLimit, auth, async (c) => {
		const user = c.get("user");
		return c.json({ user });
	});

	// gets dashboard data
	app.get("/dashboard", rateLimit, auth, async (c) => {
		const [
			totalAgents,
			activeAgents,
			totalJobs,
			totalBackups,
			backupStats,
			last10Backups,
			backupsByDay,
			failedBackups,
			storageByJob,
			totalUsers,
			totalPolicies,
		] = await Promise.all([
			db.agent.count(),
			db.agent.count({ where: { is_active: true } }),
			db.backupJob.count({ where: { is_active: true } }),
			db.backup.count(),

			db.backup.aggregate({
				_sum: { size_bytes: true },
				where: { status: "COMPLETED" },
			}),

			db.backup.findMany({
				take: 10,
				orderBy: { started_at: "desc" },
				include: {
					backup_job: {
						select: {
							files: true,
							agent: { select: { name: true } },
						},
					},
				},
			}),

			// last 7 days grouped — raw query since Prisma doesn't group by date natively
			db.$queryRaw<{ day: string; count: bigint; size: bigint }[]>`
        SELECT
          DATE_TRUNC('day', started_at)::date::text AS day,
          COUNT(*)::bigint AS count,
          COALESCE(SUM(size_bytes), 0)::bigint AS size
        FROM backups
        WHERE started_at >= NOW() - INTERVAL '7 days'
        GROUP BY 1
        ORDER BY 1 ASC
      `,

			db.backup.count({
				where: {
					status: "FAILED",
					started_at: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
				},
			}),

			db.$queryRaw<
				{
					id: string;
					job_name: string;
					agent_name: string;
					backup_count: bigint;
					size_bytes: bigint;
				}[]
			>`
        SELECT
          bj.id,
          bj.name AS job_name,
          a.name AS agent_name,
          COUNT(b.id)::bigint AS backup_count,
          COALESCE(SUM(b.size_bytes), 0)::bigint AS size_bytes
        FROM backup_jobs bj
        LEFT JOIN agents a ON a.id = bj.agent_id
        LEFT JOIN backups b ON b.backup_job_id = bj.id AND b.status = 'COMPLETED'
        GROUP BY bj.id, bj.name, a.name
        ORDER BY size_bytes DESC
        LIMIT 8
      `,

			db.user.count(),
			db.backupPolicy.count(),
		]);

		return c.json({
			stats: {
				total_agents: totalAgents,
				active_agents: activeAgents,
				total_jobs: totalJobs,
				total_backups: totalBackups,
				total_size_bytes: backupStats._sum.size_bytes?.toString() ?? "0",
				failed_last_7d: failedBackups,
			},
			last_10_backups: last10Backups.map((b) => ({
				id: b.id,
				status: b.status,
				size_bytes: b.size_bytes?.toString() ?? null,
				started_at: b.started_at,
				completed_at: b.completed_at,
				agent_name: b.backup_job.agent.name,
				files: b.backup_job.files,
				error: b.error,
			})),
			backups_by_day: backupsByDay.map((r) => ({
				day: r.day,
				count: Number(r.count),
				size_bytes: Number(r.size),
			})),
			storage_by_job: storageByJob.map((r) => ({
				id: r.id,
				job_name: r.job_name,
				agent_name: r.agent_name,
				backup_count: Number(r.backup_count),
				size_bytes: r.size_bytes.toString(),
			})),
			total_users: totalUsers,
			total_policies: totalPolicies,
		});
	});

	app.get("/agents/:id/code", rateLimit, async (c) => {
		const id = c.req.param("id");
		const agent = await db.agent.findUnique({ where: { id } });
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

	app.post("/agents/pair", rateLimit, async (c) => {
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
				where: { id: agentCodeRecord.agent_id },
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

	app.get("/agents", rateLimit, auth, async (c) => {
		const { filters, orderBy, skip, take } = c.req.query();
		const parsedFilters = filters
			? JSON.parse(decodeURIComponent(filters))
			: {};
		const parsedOrderBy = orderBy
			? JSON.parse(decodeURIComponent(orderBy))
			: {};

		const s = skip ? parseInt(skip) : undefined;
		const t = take ? parseInt(take) : undefined;

		const [rawData, total] = await Promise.all([
			db.agent.findMany({
				where: parsedFilters,
				orderBy: Object.keys(parsedOrderBy).length
					? parsedOrderBy
					: { created_at: "desc" },
				skip: s,
				take: t,
				include: {
					created_by: { select: { name: true } },
					backupJobs: {
						select: {
							backups: {
								where: { status: "COMPLETED" },
								select: { size_bytes: true },
							},
						},
					},
				},
			}),
			db.agent.count({ where: parsedFilters }),
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

		return c.json({ data, total, skip: s, take: t });
	});

	// Create Agent
	app.post("/agents", rateLimit, async (c) => {
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
	app.patch("/agents/:id", rateLimit, auth, async (c) => {
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
	app.patch("/agents/:id/toggle", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		const agent = await db.agent.findUnique({ where: { id } });
		if (!agent) return c.json({ error: "Agent not found" }, 404);

		const updated = await db.agent.update({
			where: { id },
			data: { is_active: !agent.is_active },
		});
		return c.json(updated);
	});

	// Disable Agent
	app.post("/agents/:id/disable", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		const agent = await db.agent.findUnique({ where: { id } });
		if (!agent) return c.json({ error: "Agent not found" }, 404);

		const updated = await db.agent.update({
			where: { id },
			data: { is_active: false },
		});
		return c.json(updated);
	});

	// Get Agent Details with Sessions
	app.get("/agents/:id", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		const agent = await db.agent.findUnique({
			where: { id },
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

	// Delete Agent
	app.delete("/agents/:id", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		await db.agent.delete({ where: { id } });
		return c.json({ message: "Agent deleted" });
	});

	/**
	 * USERS
	 */

	// List Users (Paginated)
	app.get("/users", rateLimit, auth, async (c) => {
		const { skip, take } = c.req.query();
		const s = skip ? parseInt(skip) : undefined;
		const t = take ? parseInt(take) : undefined;

		const [data, total] = await Promise.all([
			db.user.findMany({
				select: { id: true, email: true, created_at: true, name: true },
				skip: s,
				take: t,
			}),
			db.user.count(),
		]);
		return c.json({ data, total });
	});

	// Create User
	app.post("/users", rateLimit, auth, async (c) => {
		let json;
		try {
			json = await c.req.json();
		} catch (e) {
			return c.json({ error: "Invalid JSON" }, 400);
		}

		const { name, email, password } = json;
		if (!email || !password || !name)
			return c.json({ error: "Missing fields" }, 400);

		const hashedPassword = await Password.encrypt(password);
		const user = await db.user.create({
			data: { name, email, password: hashedPassword },
			select: { id: true, email: true },
		});
		return c.json(user, 201);
	});

	// Update User
	app.patch("/users/:id", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		let json;
		try {
			json = await c.req.json();
		} catch (e) {
			return c.json({ error: "Invalid JSON" }, 400);
		}

		if (json.password) {
			json.password = await Password.encrypt(json.password);
		}

		const user = await db.user.update({
			where: { id },
			data: json,
			select: { id: true, email: true },
		});
		return c.json(user);
	});

	// Delete User
	app.delete("/users/:id", rateLimit, auth, async (c) => {
		const tokenPayload = await Token.verify(
			c.req.header("Authorization")?.split(" ")[1] ?? "",
		);
		const userId = tokenPayload.user.id;
		if (userId === c.req.param("id")) {
			return c.json({ error: "You cannot delete your own account" }, 400);
		}

		await db.user.delete({ where: { id: c.req.param("id") } });
		return c.json({ message: "User deleted" });
	});

	/**
	 * BACKUP JOBS
	 */

	// List Backup Jobs
	app.get("/backup-jobs", rateLimit, auth, async (c) => {
		const { filters, orderBy, skip, take } = c.req.query();
		const parsedFilters = filters
			? JSON.parse(decodeURIComponent(filters))
			: {};
		const parsedOrderBy = orderBy
			? JSON.parse(decodeURIComponent(orderBy))
			: {};

		const s = skip ? parseInt(skip) : undefined;
		const t = take ? parseInt(take) : undefined;

		const [data, total] = await Promise.all([
			db.backupJob.findMany({
				where: parsedFilters,
				orderBy: Object.keys(parsedOrderBy).length
					? parsedOrderBy
					: { created_at: "desc" },
				skip: s,
				take: t,
				include: {
					agent: { select: { id: true, name: true } },
					_count: { select: { backups: true } },
					backups: {
						orderBy: { started_at: "desc" },
						take: 1,
						select: { status: true, started_at: true, completed_at: true },
					},
					backupJobPolicies: {
						include: { backup_policy: true },
					},
				},
			}),
			db.backupJob.count({ where: parsedFilters }),
		]);
		return c.json({ data, total, skip: s, take: t });
	});

	// Create Backup Job
	app.post("/backup-jobs", rateLimit, auth, async (c) => {
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

		const { cron, files, agent_id, policy_id, ...rest } = json;
		if (!cron || !files || !agent_id)
			return c.json({ error: "Missing required fields" }, 400);

		const job = await db.backupJob.create({
			data: { ...rest, cron, files, agent_id, created_by_id },
			include: { agent: { select: { id: true } } },
		});

		if (policy_id) {
			await db.backupJobPolicy.create({
				data: { backup_job_id: job.id, backup_policy_id: policy_id },
			});
		}

		return c.json(job, 201);
	});

	// Update Backup Job
	app.patch("/backup-jobs/:id", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		let json;
		try {
			json = await c.req.json();
		} catch (e) {
			return c.json({ error: "Invalid JSON" }, 400);
		}

		const { policy_id, ...jobData } = json;

		const job = await db.backupJob.update({
			where: { id },
			data: jobData,
			include: { agent: { select: { id: true } } },
		});

		// Replace all policies for this job (single-policy UI model)
		await db.backupJobPolicy.deleteMany({ where: { backup_job_id: id } });
		if (policy_id) {
			await db.backupJobPolicy.create({
				data: { backup_job_id: id, backup_policy_id: policy_id },
			});
		}

		return c.json(job);
	});

	// Delete Backup Job
	app.delete("/backup-jobs/:id", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		try {
			await db.backupJob.delete({ where: { id } });
			return c.json({ message: "Job deleted" });
		} catch (error) {
			return c.json({ error: "Failed to delete backup job" }, 400);
		}
	});

	// Manually trigger a backup for a job
	app.post("/backup-jobs/:id/backup", rateLimit, auth, async (c) => {
		const id = c.req.param("id");

		try {
			const { initBackup } = await import("./backup");
			const result = await initBackup(id);
			return c.json(
				{
					message: "Backup initiated",
					backupId: result.backupId,
					jobId: result.jobId,
				},
				201,
			);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to initiate backup";
			return c.json({ error: errorMessage }, 400);
		}
	});

	/**
	 * BACKUPS
	 */

	// List Backups (filterable by backup_job_id)
	app.get("/backups", rateLimit, auth, async (c) => {
		const { filters, orderBy, skip, take } = c.req.query();
		const parsedFilters = filters
			? JSON.parse(decodeURIComponent(filters))
			: {};
		const parsedOrderBy = orderBy
			? JSON.parse(decodeURIComponent(orderBy))
			: {};

		const s = skip ? parseInt(skip) : undefined;
		const t = take ? parseInt(take) : undefined;

		const [rawData, total] = await Promise.all([
			db.backup.findMany({
				where: parsedFilters,
				orderBy: Object.keys(parsedOrderBy).length
					? parsedOrderBy
					: { started_at: "desc" },
				skip: s,
				take: t,
			}),
			db.backup.count({ where: parsedFilters }),
		]);

		const data = rawData.map((b) => ({
			...b,
			size_bytes: b.size_bytes !== null ? b.size_bytes.toString() : null,
		}));

		return c.json({ data, total, skip: s, take: t });
	});

	// Download redirect — generates a fresh presigned URL and redirects
	app.get("/backups/:id/download", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		const backup = await db.backup.findUnique({ where: { id } });

		if (!backup) return c.json({ error: "Backup not found" }, 404);
		if (!backup.blob_key)
			return c.json({ error: "No file stored for this backup" }, 404);

		const url = await presignedDownloadUrl(backup.blob_key);
		return c.redirect(url, 302);
	});

	/**
	 * AGENT — upload endpoint (authenticated with AgentSession token)
	 */

	app.post("/agent/upload", async (c) => {
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
			where: { id: backupJobId, agent_id: session.agent_id },
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

			const url = await presignedDownloadUrl(key);

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

	/**
	 * BACKUP POLICIES
	 */

	// List All Backup Job Policies
	app.get("/backup-policies", rateLimit, auth, async (c) => {
		const { filters, orderBy, skip, take } = c.req.query();
		const parsedFilters = filters
			? JSON.parse(decodeURIComponent(filters))
			: {};
		const parsedOrderBy = orderBy
			? JSON.parse(decodeURIComponent(orderBy))
			: {};

		const s = skip ? parseInt(skip) : undefined;
		const t = take ? parseInt(take) : undefined;

		const [data, total] = await Promise.all([
			db.backupPolicy.findMany({
				where: parsedFilters,
				orderBy: Object.keys(parsedOrderBy).length
					? parsedOrderBy
					: { created_at: "desc" },
				skip: s,
				take: t,
			}),
			db.backupPolicy.count({ where: parsedFilters }),
		]);
		return c.json({ data, total, skip: s, take: t });
	});

	// Create Backup Job Policy
	app.post("/backup-policies", rateLimit, auth, async (c) => {
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

		const policy = await db.backupPolicy.create({
			data: { ...json, created_by_id },
		});
		return c.json(policy, 201);
	});

	// Update Backup Job Policy
	app.patch("/backup-policies/:id", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		let json;
		try {
			json = await c.req.json();
		} catch (e) {
			return c.json({ error: "Invalid JSON" }, 400);
		}

		const policy = await db.backupPolicy.update({
			where: { id },
			data: json,
		});
		return c.json(policy);
	});

	// Delete Backup Job Policy
	app.delete("/backup-policies/:id", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		try {
			await db.backupPolicy.delete({ where: { id } });
			return c.json({ message: "Policy deleted" });
		} catch (error) {
			return c.json({ error: "Failed to delete backup policy" }, 400);
		}
	});
}
