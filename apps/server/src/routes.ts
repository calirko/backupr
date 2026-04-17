import type { Hono } from "hono";
import { prisma } from "./lib/prisma";
import { Password } from "./lib/password";
import { Token, type TokenPayload } from "./lib/token";
import { rateLimit } from "./lib/rate-limit";
import { auth } from "./lib/auth";
import { generateAgentCode, generateAgentToken } from "./lib/agent";

const db = prisma;

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

		const { email, password } = json ?? {};
		if (!email || !password) {
			return c.json({ error: "Email and password are required" }, 400);
		}

		const user = await db.user.findUnique({ where: { email } });
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
			return c.json({
				agent_code: existingCode.code,
				expires_at: existingCode.expires_at,
			});
		}

		const generatedCode = generateAgentCode();

		const newCode = await db.agentCode.create({
			data: {
				code: generatedCode,
				agent_id: agent.id,
				created_by_id,
				expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
			},
		});

		return c.json({ agent_code: newCode.code, expires_at: newCode.expires_at });
	});

	app.post("/agents/pair", rateLimit, async (c) => {
		let json;

		try {
			json = await c.req.json();
		} catch (e) {
			return c.json({ error: "Invalid JSON" }, 400);
		}

		const { agentCode, name, info } = json;

		if (!agentCode || !name) {
			return c.json({ error: "Code and name are required" }, 400);
		}

		const agentCodeRecord = await db.agentCode.findUnique({
			where: { code: agentCode },
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
			await tx.agentCode.update({
				where: { id: agentCodeRecord.id },
				data: { used_at: new Date() },
			});

			const agent = await tx.agent.create({
				data: {
					name,
					info: info ?? {},
					created_by_id: agentCodeRecord.created_by_id,
				},
			});

			const token = generateAgentToken({
				agentName: agent.name,
				agentId: agent.id,
			});
			const session = await tx.agentSession.create({
				data: {
					agent_id: agent.id,
					token: token,
				},
			});

			return { agent, token: session.token };
		});

		return c.json({
			message: "Pairing successful",
			agent_id: result.agent.id,
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

		const [data, total] = await Promise.all([
			db.agent.findMany({
				where: parsedFilters,
				orderBy: Object.keys(parsedOrderBy).length
					? parsedOrderBy
					: { created_at: "desc" },
				skip: s,
				take: t,
			}),
			db.agent.count({ where: parsedFilters }),
		]);

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
				select: { id: true, name: true, email: true, created_at: true },
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
			select: { id: true, name: true, email: true },
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
			select: { id: true, name: true, email: true },
		});
		return c.json(user);
	});

	// Delete User
	app.delete("/users/:id", rateLimit, auth, async (c) => {
		await db.user.delete({ where: { id: c.req.param("id") } });
		return c.json({ message: "User deleted" });
	});

	/**
	 * BACKUP JOBS
	 */

	// List Backup Jobs
	app.get("/backup-jobs", rateLimit, auth, async (c) => {
		const { skip, take } = c.req.query();
		const [data, total] = await Promise.all([
			db.backupJob.findMany({
				skip: skip ? parseInt(skip) : undefined,
				take: take ? parseInt(take) : undefined,
				include: { agent: { select: { name: true } } },
			}),
			db.backupJob.count(),
		]);
		return c.json({ data, total });
	});

	// Create Backup Job
	app.post("/backup-jobs", rateLimit, auth, async (c) => {
		let json;
		try {
			json = await c.req.json();
		} catch (e) {
			return c.json({ error: "Invalid JSON" }, 400);
		}

		const { cron, files, agent_id, created_by_id } = json;
		if (!cron || !files || !agent_id)
			return c.json({ error: "Missing required fields" }, 400);

		const job = await db.backupJob.create({ data: json });
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

		const job = await db.backupJob.update({
			where: { id },
			data: json,
		});
		return c.json(job);
	});

	// Delete Backup Job
	app.delete("/backup-jobs/:id", rateLimit, auth, async (c) => {
		await db.backupJob.delete({ where: { id: c.req.param("id") } });
		return c.json({ message: "Job deleted" });
	});

	/**
	 * BACKUP POLICIES
	 */

	// List All Backup Job Policies
	app.get("/backup-policies", rateLimit, auth, async (c) => {
		const { skip, take } = c.req.query();
		const [data, total] = await Promise.all([
			db.backupPolicy.findMany({
				skip: skip ? parseInt(skip) : undefined,
				take: take ? parseInt(take) : undefined,
			}),
			db.backupPolicy.count(),
		]);
		return c.json({ data, total });
	});

	// Create Backup Job Policy
	app.post("/backup-policies", rateLimit, auth, async (c) => {
		let json;
		try {
			json = await c.req.json();
		} catch (e) {
			return c.json({ error: "Invalid JSON" }, 400);
		}

		const { created_by_id } = json;
		if (!created_by_id)
			return c.json({ error: "created_by_id is required" }, 400);

		const policy = await db.backupPolicy.create({ data: json });
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
		await db.backupPolicy.delete({ where: { id: c.req.param("id") } });
		return c.json({ message: "Policy deleted" });
	});
}
