import type { Hono } from "hono";
import { initBackup } from "../backup";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { rateLimit } from "../lib/rate-limit";
import { Token } from "../lib/token";
import { agentRegistry, sendToAgent } from "../ws.agent";

const db = prisma;
const SERVER_URL = process.env.SERVER_URL || "http://localhost:5174";

export default async function backupJobRoutes(app: Hono) {
	// List Backup Jobs
	app.get("/api/backup-jobs", rateLimit, auth, async (c) => {
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

		const [data, total, absoluteTotal] = await Promise.all([
			db.backupJob.findMany({
				where: baseWhere,
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
			db.backupJob.count({ where: baseWhere }),
			db.backupJob.count({
				where: { deleted_at: null, agent_id: parsedFilters.agent_id },
			}),
		]);
		const schedulerTimezone = process.env.TZ ?? "UTC";
		return c.json({ data, total, absoluteTotal, skip: s, take: t, schedulerTimezone });
	});

	// Create Backup Job
	app.post("/api/backup-jobs", rateLimit, auth, async (c) => {
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

		const job = await db.$transaction(async (tx) => {
			const created = await tx.backupJob.create({
				data: { ...rest, cron, files, agent_id, created_by_id },
				include: { agent: { select: { id: true } } },
			});
			if (policy_id) {
				await tx.backupJobPolicy.create({
					data: { backup_job_id: created.id, backup_policy_id: policy_id },
				});
			}
			return created;
		});

		return c.json(job, 201);
	});

	// Update Backup Job
	app.patch("/api/backup-jobs/:id", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		let json;
		try {
			json = await c.req.json();
		} catch (e) {
			return c.json({ error: "Invalid JSON" }, 400);
		}

		const { policy_id, ...jobData } = json;

		// Replace all policies atomically with the job update (single-policy UI model)
		const job = await db.$transaction(async (tx) => {
			const updated = await tx.backupJob.update({
				where: { id },
				data: jobData,
				include: { agent: { select: { id: true } } },
			});
			await tx.backupJobPolicy.deleteMany({ where: { backup_job_id: id } });
			if (policy_id) {
				await tx.backupJobPolicy.create({
					data: { backup_job_id: id, backup_policy_id: policy_id },
				});
			}
			return updated;
		});

		return c.json(job);
	});

	// Delete Backup Job
	app.delete("/api/backup-jobs/:id", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		try {
			await db.backupJob.update({
				where: { id },
				data: { deleted_at: new Date() },
			});
			return c.json({ message: "Job deleted" });
		} catch (error) {
			return c.json({ error: "Failed to delete backup job" }, 400);
		}
	});

	// Test a backup job (dry-run info)
	app.get("/api/backup-jobs/:id/test", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		const start = Date.now();

		try {
			const job = await db.backupJob.findUnique({
				where: { id },
				include: { agent: true },
			});

			if (!job) return c.json({ error: "Backup job not found" }, 404);

			const agentState = agentRegistry.get(job.agent_id);
			const agentOnline = agentState?.status === "online";

			const critical_info: string[] = [];
			if (!agentOnline)
				critical_info.push("Agent is offline, backup cannot run");
			if (!job.files || (job.files as string[]).length === 0)
				critical_info.push("No files or directories configured");
			if (!job.is_active) critical_info.push("Job is inactive");
			if (job.use_password && !job.password)
				critical_info.push("Password protection enabled but no password set");

			let dryRunResult: Record<string, unknown> = {
				storage_required: null,
				files_found: (job.files as string[]).length > 0,
				file_count: (job.files as string[]).length,
				files: job.files as string[],
			};

			if (agentOnline) {
				try {
					const result = await sendToAgent(job.agent_id, {
						type: "dry_run",
						files: job.files as string[],
						compression_level: job.compression_level,
					});
					dryRunResult = {
						storage_required: result.storage_required ?? null,
						files_found: result.files_found ?? false,
						file_count: result.file_count ?? 0,
						files: result.files ?? [],
						path_results: result.path_results ?? [],
					};
				} catch (err) {
					critical_info.push(
						`Dry run failed: ${err instanceof Error ? err.message : "unknown error"}`,
					);
				}
			}

			return c.json({
				date_triggered: new Date().toISOString(),
				time_elapsed_ms: Date.now() - start,
				agent_online: agentOnline,
				critical_info,
				...dryRunResult,
			});
		} catch (error) {
			return c.json({ error: "Failed to run test" }, 500);
		}
	});

	// Manually trigger a backup for a job
	app.post("/api/backup-jobs/:id/backup", rateLimit, auth, async (c) => {
		const id = c.req.param("id");

		try {
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
}
