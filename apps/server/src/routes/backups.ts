import type { Hono } from "hono";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { rateLimit } from "../lib/rate-limit";
import { presignedDownloadUrl } from "../lib/storage";
import { Token } from "../lib/token";

const db = prisma;
const SERVER_URL = process.env.SERVER_URL || "http://localhost:5174";

export default async function backupRoutes(app: Hono) {
	// List Backups (filterable by backup_job_id)
	app.get("/api/backups", rateLimit, auth, async (c) => {
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
	app.get("/api/backups/:id/download", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		const backup = await db.backup.findUnique({
			where: { id },
			include: { backup_job: true },
		});

		if (!backup) return c.json({ error: "Backup not found" }, 404);
		if (!backup.blob_key)
			return c.json({ error: "No file stored for this backup" }, 404);

		const filename = `${backup.backup_job.name}.7z`;
		const url = await presignedDownloadUrl(
			backup.blob_key,
			undefined,
			filename,
		);
		return c.redirect(url, 302);
	});
}
