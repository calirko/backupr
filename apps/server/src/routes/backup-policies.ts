import type { Hono } from "hono";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { type ListSpec, parseListQuery, toOrderBy } from "../lib/query";
import { rateLimit } from "../lib/rate-limit";
import { field, param, readJson } from "../lib/validate";

const db = prisma;

const listSpec: ListSpec = {
	filters: {
		keep_last_n_backups: "number",
		max_backup_age_in_days: "number",
		created_at: "date",
		"created_by.name": "string",
	},
	sort: [
		"keep_last_n_backups",
		"max_backup_age_in_days",
		"created_at",
		"updated_at",
		"created_by.name",
	],
};

function readPolicyFields(json: Record<string, unknown>) {
	return {
		keep_last_n_backups: field.int(json, "keep_last_n_backups", {
			nullable: true,
			min: 1,
			max: 100_000,
		}),
		max_backup_age_in_days: field.int(json, "max_backup_age_in_days", {
			nullable: true,
			min: 1,
			max: 36_500,
		}),
	};
}

export default async function backupPolicyRoutes(app: Hono) {
	// List All Backup Job Policies
	app.get("/api/backup-policies", rateLimit, auth, async (c) => {
		const { where, sort, skip, take } = parseListQuery(c.req.query(), listSpec);
		const baseWhere = { ...where, deleted_at: null };

		const [rawData, total, absoluteTotal, usage] = await Promise.all([
			db.backupPolicy.findMany({
				where: baseWhere,
				orderBy: toOrderBy(sort, { created_at: "desc" }),
				skip,
				take,
				include: {
					created_by: {
						select: {
							name: true,
						},
					},
				},
			}),
			db.backupPolicy.count({ where: baseWhere }),
			db.backupPolicy.count({ where: { deleted_at: null } }),
			db.$queryRaw<
				{
					policy_id: string;
					job_count: number;
					backup_count: number;
					size_bytes: bigint;
					oldest_backup_at: Date | null;
					max_backups_per_job: number;
				}[]
			>`
         WITH per_job AS (
           SELECT
             bjp.backup_policy_id AS policy_id,
             bj.id AS job_id,
             COUNT(b.id) AS backups,
             COALESCE(SUM(b.size_bytes), 0) AS size,
             MIN(b.started_at) AS oldest
           FROM backup_job_policies bjp
           JOIN backup_jobs bj ON bj.id = bjp.backup_job_id AND bj.deleted_at IS NULL
           LEFT JOIN backups b ON b.backup_job_id = bj.id AND b.status = 'COMPLETED'
           GROUP BY 1, 2
         )
         SELECT
           policy_id,
           COUNT(*)::int AS job_count,
           SUM(backups)::int AS backup_count,
           SUM(size)::bigint AS size_bytes,
           MIN(oldest) AS oldest_backup_at,
           MAX(backups)::int AS max_backups_per_job
         FROM per_job
         GROUP BY 1
       `,
		]);

		const usageByPolicy = new Map(usage.map((u) => [u.policy_id, u]));
		// Retention is swept hourly; allow a day of slack before calling it overdue
		const graceMs = 24 * 60 * 60_000;

		const data = rawData.map((policy) => {
			const u = usageByPolicy.get(policy.id);
			const oldest = u?.oldest_backup_at ?? null;
			const overAge =
				policy.max_backup_age_in_days != null &&
				oldest != null &&
				Date.now() - oldest.getTime() >
					policy.max_backup_age_in_days * 24 * 60 * 60_000 + graceMs;
			const overCount =
				policy.keep_last_n_backups != null &&
				(u?.max_backups_per_job ?? 0) > policy.keep_last_n_backups;

			return {
				...policy,
				job_count: u?.job_count ?? 0,
				backup_count: u?.backup_count ?? 0,
				size_bytes: (u?.size_bytes ?? 0n).toString(),
				oldest_backup_at: oldest,
				retention_overdue: overAge || overCount,
			};
		});

		return c.json({ data, total, absoluteTotal, skip, take });
	});

	// Create Backup Job Policy
	app.post("/api/backup-policies", rateLimit, auth, async (c) => {
		const json = await readJson(c);

		const policy = await db.backupPolicy.create({
			data: { ...readPolicyFields(json), created_by_id: c.get("user").id },
		});
		return c.json(policy, 201);
	});

	// Update Backup Job Policy
	app.patch("/api/backup-policies/:id", rateLimit, auth, async (c) => {
		const id = param(c, "id");
		const json = await readJson(c);

		const policy = await db.backupPolicy.update({
			where: { id, deleted_at: null },
			data: readPolicyFields(json),
		});
		return c.json(policy);
	});

	// Delete Backup Job Policy
	app.delete("/api/backup-policies/:id", rateLimit, auth, async (c) => {
		const id = param(c, "id");
		try {
			const usageCount = await db.backupJobPolicy.findMany({
				where: {
					backup_policy_id: id,
					backup_policy: { deleted_at: null },
					backup_job: { deleted_at: null },
				},
				include: {
					backup_job: {
						select: {
							name: true,
						},
					},
				},
			});
			if (usageCount.length > 0) {
				return c.json(
					{
						error: `This policy is assigned to ${usageCount.length} backup job${usageCount.length === 1 ? "" : "s"} (${usageCount.map((u) => u.backup_job.name).join(", ")}). Remove it from all backup jobs before deleting.`,
					},
					409,
				);
			}
			await db.backupPolicy.update({
				where: { id },
				data: { deleted_at: new Date() },
			});
			return c.json({ message: "Policy deleted" });
		} catch (error) {
			return c.json({ error: "Failed to delete backup policy" }, 400);
		}
	});
}
