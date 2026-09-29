import type { Hono } from "hono";
import { initBackup } from "../backup";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { type ListSpec, parseListQuery, toOrderBy } from "../lib/query";
import { rateLimit } from "../lib/rate-limit";
import { defined, field, HttpError, param, readJson } from "../lib/validate";
import { STALE_AFTER_DAYS } from "../notifications";
import { countScheduledRuns, isValidCron } from "../scheduler";
import { agentRegistry, sendToAgent } from "../ws.agent";

const db = prisma;
const DAY_MS = 24 * 60 * 60_000;

const listSpec: ListSpec = {
	filters: {
		name: "string",
		agent_id: "id",
		"agent.name": "string",
		is_active: "boolean",
		cron: "string",
		created_at: "date",
	},
	sort: [
		"name",
		"cron",
		"is_active",
		"compression_level",
		"created_at",
		"updated_at",
		"agent.name",
	],
};

type Body = Record<string, unknown>;

/** Reads the writable job fields; `create` makes the essentials required. */
async function readJobFields(json: Body, create: boolean) {
	const cron = field.string(json, "cron", { required: create, max: 100 });
	if (cron != null && !isValidCron(cron)) {
		throw new HttpError(400, "Invalid cron expression");
	}

	const agentId = field.string(json, "agent_id", { required: create });
	if (agentId != null) {
		const agent = await db.agent.findFirst({
			where: { id: agentId, deleted_at: null },
			select: { id: true },
		});
		if (!agent) throw new HttpError(400, "Agent not found");
	}

	return defined({
		name: field.string(json, "name", { required: create }) ?? undefined,
		cron: cron ?? undefined,
		agent_id: agentId ?? undefined,
		files: field.stringArray(json, "files", { required: create }),
		is_active: field.boolean(json, "is_active"),
		use_password: field.boolean(json, "use_password"),
		password: field.string(json, "password", { nullable: true, max: 1024 }),
		compression_level:
			field.int(json, "compression_level", { min: 0, max: 9 }) ?? undefined,
	});
}

/** `policy_id`: undefined = leave as is, null = none, string = must exist. */
async function readPolicyId(json: Body) {
	const policyId = field.string(json, "policy_id", { nullable: true });
	if (policyId) {
		const policy = await db.backupPolicy.findFirst({
			where: { id: policyId, deleted_at: null },
			select: { id: true },
		});
		if (!policy) throw new HttpError(400, "Backup policy not found");
	}
	return policyId || (policyId === undefined ? undefined : null);
}

export default async function backupJobRoutes(app: Hono) {
	// List Backup Jobs
	app.get("/api/backup-jobs", rateLimit, auth, async (c) => {
		const { where, sort, skip, take } = parseListQuery(c.req.query(), listSpec);
		const baseWhere = { ...where, deleted_at: null };

		const [rawData, total, absoluteTotal] = await Promise.all([
			db.backupJob.findMany({
				where: baseWhere,
				orderBy: toOrderBy(sort, { created_at: "desc" }),
				skip,
				take,
				include: {
					agent: { select: { id: true, name: true, is_active: true } },
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
				where: { deleted_at: null, agent_id: where.agent_id as string | undefined },
			}),
		]);

		// Health stats over the last 7 days, matching the dashboard window
		const now = new Date();
		const since = new Date(now.getTime() - 7 * DAY_MS);
		const staleCutoff = new Date(now.getTime() - STALE_AFTER_DAYS * DAY_MS);
		const jobIds = rawData.map((job) => job.id);

		const [statusCounts, lastSuccesses] = jobIds.length
			? await Promise.all([
					db.backup.groupBy({
						by: ["backup_job_id", "status"],
						where: { backup_job_id: { in: jobIds }, started_at: { gte: since } },
						_count: { _all: true },
					}),
					db.backup.findMany({
						where: { backup_job_id: { in: jobIds }, status: "COMPLETED" },
						orderBy: { started_at: "desc" },
						distinct: ["backup_job_id"],
						select: { backup_job_id: true, started_at: true },
					}),
				])
			: [[], []];

		const countsByJob = new Map<string, Record<string, number>>();
		for (const row of statusCounts) {
			const counts = countsByJob.get(row.backup_job_id) ?? {};
			counts[row.status] = row._count._all;
			countsByJob.set(row.backup_job_id, counts);
		}
		const lastSuccessByJob = new Map(
			lastSuccesses.map((b) => [b.backup_job_id, b.started_at]),
		);

		// Jobs created mid-window are only expected to have run since creation
		const expectedRuns = rawData.map((job) =>
			job.is_active && job.agent.is_active
				? (countScheduledRuns(
						[job.cron],
						job.created_at > since ? job.created_at : since,
						now,
					)[0] ?? 0)
				: 0,
		);

		const data = rawData.map((job, i) => {
			const counts = countsByJob.get(job.id) ?? {};
			const completed = counts.COMPLETED ?? 0;
			const failed = counts.FAILED ?? 0;
			const runs = Object.values(counts).reduce((a, b) => a + b, 0);
			const expected = expectedRuns[i] ?? 0;
			const lastSuccessAt = lastSuccessByJob.get(job.id) ?? null;
			const monitored = job.is_active && job.agent.is_active;

			return {
				...job,
				completed_7d: completed,
				failed_7d: failed,
				runs_7d: runs,
				expected_runs_7d: expected,
				success_rate:
					completed + failed > 0 ? (completed / (completed + failed)) * 100 : null,
				completion_rate:
					expected > 0 ? Math.min(100, (runs / expected) * 100) : null,
				last_success_at: lastSuccessAt,
				is_stale: monitored && (lastSuccessAt ?? job.created_at) < staleCutoff,
			};
		});

		const schedulerTimezone = process.env.TZ ?? "UTC";
		return c.json({ data, total, absoluteTotal, skip, take, schedulerTimezone });
	});

	// Create Backup Job
	app.post("/api/backup-jobs", rateLimit, auth, async (c) => {
		const json = await readJson(c);
		const data = await readJobFields(json, true);
		const policyId = await readPolicyId(json);

		const job = await db.$transaction(async (tx) => {
			const created = await tx.backupJob.create({
				data: {
					...(data as Required<typeof data>),
					created_by_id: c.get("user").id,
				},
				include: { agent: { select: { id: true } } },
			});
			if (policyId) {
				await tx.backupJobPolicy.create({
					data: { backup_job_id: created.id, backup_policy_id: policyId },
				});
			}
			return created;
		});

		return c.json(job, 201);
	});

	// Update Backup Job
	app.patch("/api/backup-jobs/:id", rateLimit, auth, async (c) => {
		const id = param(c, "id");
		const json = await readJson(c);
		const data = await readJobFields(json, false);
		const policyId = await readPolicyId(json);

		// Replace all policies atomically with the job update (single-policy UI model)
		const job = await db.$transaction(async (tx) => {
			const updated = await tx.backupJob.update({
				where: { id, deleted_at: null },
				data,
				include: { agent: { select: { id: true } } },
			});
			if (policyId !== undefined) {
				await tx.backupJobPolicy.deleteMany({ where: { backup_job_id: id } });
				if (policyId) {
					await tx.backupJobPolicy.create({
						data: { backup_job_id: id, backup_policy_id: policyId },
					});
				}
			}
			return updated;
		});

		return c.json(job);
	});

	// Delete Backup Job
	app.delete("/api/backup-jobs/:id", rateLimit, auth, async (c) => {
		const id = param(c, "id");
		try {
			await db.backupJob.update({
				where: { id, deleted_at: null },
				data: { deleted_at: new Date() },
			});
			return c.json({ message: "Job deleted" });
		} catch (error) {
			return c.json({ error: "Failed to delete backup job" }, 400);
		}
	});

	// Test a backup job (dry-run info)
	app.get("/api/backup-jobs/:id/test", rateLimit, auth, async (c) => {
		const id = param(c, "id");
		const start = Date.now();

		try {
			const job = await db.backupJob.findFirst({
				where: { id, deleted_at: null },
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
		const id = param(c, "id");

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
