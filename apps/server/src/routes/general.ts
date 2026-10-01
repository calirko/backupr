import type { Context, Hono } from "hono";
import pkg from "../../package.json";
import { auth } from "../lib/auth";
import { Password } from "../lib/password";
import { prisma } from "../lib/prisma";
import { authRateLimit, getClientIp, rateLimit } from "../lib/rate-limit";
import { getMinIOFreeBytes } from "../lib/storage";
import { Token, type TokenPayload } from "../lib/token";
import { readJson } from "../lib/validate";

const db = prisma;

// Compared against when the user doesn't exist, so a login attempt takes the
// same time either way and can't be used to enumerate accounts.
const DUMMY_HASH = Password.encrypt(crypto.randomUUID());

function parseSessionInfo(c: Context) {
	const ua = (c.req.header("user-agent") ?? "").slice(0, 512);
	const ip = getClientIp(c);

	const browser = /Edg\//.test(ua)
		? "Edge"
		: /Chrome\//.test(ua)
			? "Chrome"
			: /Firefox\//.test(ua)
				? "Firefox"
				: /Safari\//.test(ua)
					? "Safari"
					: "Unknown";

	const os = /Windows/.test(ua)
		? "Windows"
		: /Macintosh|Mac OS X/.test(ua)
			? "macOS"
			: /Android/.test(ua)
				? "Android"
				: /iPhone|iPad/.test(ua)
					? "iOS"
					: /Linux/.test(ua)
						? "Linux"
						: "Unknown";

	return { ip, browser, os, user_agent: ua };
}

export default async function generalRoutes(app: Hono) {
	app.get("/api/ping", (c) => {
		return c.json({ message: "pong", version: pkg.version });
	});

	// user
	app.post("/api/auth/login", authRateLimit, async (c) => {
		const { emailOrUsername, password } = await readJson(c);
		if (
			typeof emailOrUsername !== "string" ||
			typeof password !== "string" ||
			!emailOrUsername ||
			!password ||
			emailOrUsername.length > 255 ||
			password.length > 1024
		) {
			return c.json(
				{
					error: "Username/email and password are required",
				},
				400,
			);
		}

		// Try to find user by email first, then by name (username)
		let user = await db.user.findFirst({
			where: { email: emailOrUsername, deleted_at: null },
		});
		if (!user) {
			user = await db.user.findFirst({
				where: { username: emailOrUsername, deleted_at: null },
			});
		}
		const passwordOk = await Password.compare(
			password,
			user?.password ?? (await DUMMY_HASH),
		);
		if (!user || !passwordOk) {
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
				info: parseSessionInfo(c),
			},
		});

		return c.json({
			message: "Login successful",
			token: generatedToken,
		});
	});

	app.get("/api/auth/me", rateLimit, auth, async (c) => {
		const user = c.get("user");
		return c.json({ user });
	});

	app.post("/api/auth/refresh", rateLimit, auth, async (c) => {
		const oldToken = c.get("token");
		const user = c.get("user");

		const iat = Token.nowInSeconds();
		const exp = Token.expiresAtSeconds();

		const payload: TokenPayload = {
			user: { id: user.id, name: user.name, email: user.email },
			exp,
			iat,
			nbf: iat,
			iss: "backupr",
		};

		const newToken = await Token.generate(payload);

		await db.$transaction([
			db.userSession.delete({ where: { token: oldToken } }),
			db.userSession.create({
				data: {
					token: newToken,
					user_id: user.id,
					expires_at: Token.secondsToDate(exp),
					info: parseSessionInfo(c),
				},
			}),
		]);

		return c.json({ token: newToken });
	});

	// gets dashboard data
	app.get("/api/dashboard", rateLimit, auth, async (c) => {
		// Activity only counts backups of jobs (and agents) that still exist; storage
		// totals below keep every backup since their files remain in the bucket.
		const liveJob = {
			backup_job: { deleted_at: null, agent: { deleted_at: null } },
		};

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
			completedBackups,
			freeBytes,
		] = await Promise.all([
			db.agent.count({ where: { deleted_at: null } }),
			db.agent.count({ where: { is_active: true, deleted_at: null } }),
			db.backupJob.count({ where: { is_active: true, deleted_at: null } }),
			db.backup.count({ where: liveJob }),

			db.backup.aggregate({
				_sum: { size_bytes: true },
				where: { status: "COMPLETED" },
			}),

			db.backup.findMany({
				where: liveJob,
				take: 10,
				orderBy: { started_at: "desc" },
				include: {
					backup_job: {
						select: {
							files: true,
							name: true,
							agent: { select: { name: true } },
						},
					},
				},
			}),

			// last 7 days grouped - raw query since Prisma doesn't group by date natively
			db.$queryRaw<
				{
					day: string;
					count: bigint;
					completed: bigint;
					failed: bigint;
					size: bigint;
				}[]
			>`
         SELECT
           DATE_TRUNC('day', b.started_at)::date::text AS day,
           COUNT(*)::bigint AS count,
           COUNT(*) FILTER (WHERE b.status = 'COMPLETED')::bigint AS completed,
           COUNT(*) FILTER (WHERE b.status = 'FAILED')::bigint AS failed,
           COALESCE(SUM(b.size_bytes), 0)::bigint AS size
         FROM backups b
         JOIN backup_jobs bj ON bj.id = b.backup_job_id AND bj.deleted_at IS NULL
         JOIN agents a ON a.id = bj.agent_id AND a.deleted_at IS NULL
         WHERE b.started_at >= NOW() - INTERVAL '7 days'
         GROUP BY 1
         ORDER BY 1 ASC
       `,

			db.backup.count({
				where: {
					...liveJob,
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
         WHERE bj.deleted_at IS NULL AND (a.id IS NULL OR a.deleted_at IS NULL)
         GROUP BY bj.id, bj.name, a.name
         ORDER BY size_bytes DESC
         LIMIT 8
       `,

			db.user.count({ where: { deleted_at: null } }),
			db.backupPolicy.count({ where: { deleted_at: null } }),
			db.backup.count({ where: { status: "COMPLETED" } }),
			getMinIOFreeBytes(),
		]);

		return c.json({
			stats: {
				total_agents: totalAgents,
				active_agents: activeAgents,
				total_jobs: totalJobs,
				total_backups: totalBackups,
				total_size_bytes: (backupStats._sum.size_bytes ?? 0n).toString(),
				free_size_bytes: freeBytes?.toString() ?? null,
				total_objects: completedBackups,
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
				job_name: b.backup_job.name,
			})),
			backups_by_day: backupsByDay.map((r) => ({
				day: r.day,
				count: Number(r.count),
				completed: Number(r.completed),
				failed: Number(r.failed),
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
}
