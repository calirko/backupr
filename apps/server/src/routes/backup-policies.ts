import type { Hono } from "hono";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { rateLimit } from "../lib/rate-limit";
import { Token } from "../lib/token";
import { presignedDownloadUrl, uploadStream } from "../lib/storage";

const db = prisma;
const SERVER_URL = process.env.SERVER_URL || "http://localhost:5174";

export default async function backupPolicyRoutes(app: Hono) {
	// List All Backup Job Policies
	app.get("/api/backup-policies", rateLimit, auth, async (c) => {
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
			db.backupPolicy.findMany({
				where: baseWhere,
				orderBy: Object.keys(parsedOrderBy).length
					? parsedOrderBy
					: { created_at: "desc" },
				skip: s,
				take: t,
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
		]);
		return c.json({ data, total, absoluteTotal, skip: s, take: t });
	});

	// Create Backup Job Policy
	app.post("/api/backup-policies", rateLimit, auth, async (c) => {
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
	app.patch("/api/backup-policies/:id", rateLimit, auth, async (c) => {
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
	app.delete("/api/backup-policies/:id", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
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
