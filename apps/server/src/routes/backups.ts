import type { Hono } from "hono";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { type ListSpec, parseListQuery, toOrderBy } from "../lib/query";
import { param } from "../lib/validate";
import { rateLimit } from "../lib/rate-limit";
import { presignedDownloadUrl } from "../lib/storage";

const db = prisma;

const listSpec: ListSpec = {
	filters: {
		backup_job_id: "id",
		status: { enum: ["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"] },
		started_at: "date",
		completed_at: "date",
	},
	sort: ["started_at", "completed_at", "status", "size_bytes"],
};

export default async function backupRoutes(app: Hono) {
	// List Backups (filterable by backup_job_id)
	app.get("/api/backups", rateLimit, auth, async (c) => {
		const { where, sort, skip, take } = parseListQuery(c.req.query(), listSpec);

		const [rawData, total, absoluteTotal] = await Promise.all([
			db.backup.findMany({
				where,
				orderBy: toOrderBy(sort, { started_at: "desc" }),
				skip,
				take,
				include: {
					backup_job: {
						select: {
							id: true,
							name: true,
							cron: true,
							agent: { select: { id: true, name: true } },
						},
					},
				},
			}),
			db.backup.count({ where }),
			db.backup.count({}),
		]);

		const data = rawData.map((b) => ({
			...b,
			size_bytes: b.size_bytes !== null ? b.size_bytes.toString() : null,
		}));

		return c.json({ data, total, absoluteTotal, skip, take });
	});

	// Download redirect - generates a fresh presigned URL and redirects
	app.get("/api/backups/:id/download", rateLimit, auth, async (c) => {
		const id = param(c, "id");
		const backup = await db.backup.findUnique({
			where: { id },
			include: { backup_job: true },
		});

		if (!backup) return c.json({ error: "Backup not found" }, 404);
		if (!backup.blob_key)
			return c.json({ error: "No file stored for this backup" }, 404);

		const date = backup.completed_at ?? backup.started_at ?? new Date();
		const dateStr = date.toISOString().slice(0, 16).replace(/:/g, "-");
		const safeName = backup.backup_job.name
			.toLowerCase()
			.replace(/\s+/g, "_")
			.replace(/[^a-z0-9_]/g, "");
		const filename = `${safeName}_${dateStr}.7z`;
		const url = await presignedDownloadUrl(
			backup.blob_key,
			undefined,
			filename,
		);
		return c.redirect(url, 302);
	});
}
