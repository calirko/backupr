import { PrismaClient } from "@prisma/client";
import type { Hono } from "hono";
import { Token } from "../lib/token";
import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

// Middleware to validate JWT token
async function validateToken(c: any, next: any) {
	try {
		const authHeader = c.req.header("Authorization");

		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return c.json({ error: "No token provided" }, 401);
		}

		const token = authHeader.substring(7);
		const payload = await Token.decrypt(token);

		if (!payload) {
			return c.json({ error: "Invalid or expired token" }, 401);
		}

		c.set("user", payload);
		await next();
	} catch (error) {
		console.error("Token validation error:", error);
		return c.json({ error: "Unauthorized" }, 401);
	}
}

export function setupBackupsRoutes(app: Hono, BACKUP_STORAGE_DIR: string) {
	// Get all backups (with pagination, filters, ordering)
	app.get("/api/backups", validateToken, async (c) => {
		try {
			const skip = parseInt(c.req.query("skip") || "0", 10);
			const take = parseInt(c.req.query("take") || "30", 10);
			const filtersParam = c.req.query("filters");
			const orderByParam = c.req.query("orderBy");

			// Parse filters and orderBy if provided
			const filters = filtersParam ? JSON.parse(decodeURIComponent(filtersParam)) : {};
			const orderBy = orderByParam ? JSON.parse(decodeURIComponent(orderByParam)) : { timestamp: "desc" };

			// Build where clause from filters
			const where: any = {};
			if (filters.status) {
				where.status = filters.status;
			}
			if (filters.backupName) {
				where.backupName = { contains: filters.backupName, mode: "insensitive" };
			}

			const [backups, total] = await Promise.all([
				prisma.backup.findMany({
					where,
					skip,
					take,
					orderBy,
					include: {
						client: {
							select: {
								id: true,
								name: true,
								email: true,
							},
						},
						user: {
							select: {
								id: true,
								name: true,
								email: true,
							},
						},
						_count: {
							select: {
								files: true,
							},
						},
					},
				}),
				prisma.backup.count({ where }),
			]);

			return c.json({ data: backups, total });
		} catch (error) {
			console.error("Error fetching backups:", error);
			return c.json({ error: "Failed to fetch backups" }, 500);
		}
	});

	// Get single backup by ID
	app.get("/api/backups/:id", validateToken, async (c) => {
		try {
			const id = c.req.param("id");

			const backup = await prisma.backup.findUnique({
				where: { id },
				include: {
					client: {
						select: {
							id: true,
							name: true,
							email: true,
						},
					},
					user: {
						select: {
							id: true,
							name: true,
							email: true,
						},
					},
					files: true,
				},
			});

			if (!backup) {
				return c.json({ error: "Backup not found" }, 404);
			}

			return c.json({ backup });
		} catch (error) {
			console.error("Error fetching backup:", error);
			return c.json({ error: "Failed to fetch backup" }, 500);
		}
	});

	// Download backup file
	app.get("/api/backups/:id/download/:fileId", validateToken, async (c) => {
		try {
			const backupId = c.req.param("id");
			const fileId = c.req.param("fileId");

			const file = await prisma.backupFile.findUnique({
				where: { id: fileId },
				include: {
					backup: {
						include: {
							client: true,
						},
					},
				},
			});

			if (!file || file.backupId !== backupId) {
				return c.json({ error: "File not found" }, 404);
			}

			// Construct file path
			const filePath = join(
				BACKUP_STORAGE_DIR,
				file.backup.client?.name || file.backup.userId || "unknown",
				file.backup.backupName || "default",
				file.filePath,
			);

			if (!existsSync(filePath)) {
				return c.json({ error: "File not found on disk" }, 404);
			}

			// Stream the file
			const stream = createReadStream(filePath);
			
			return new Response(stream as any, {
				headers: {
					"Content-Type": "application/octet-stream",
					"Content-Disposition": `attachment; filename="${file.filePath.split("/").pop()}"`,
				},
			});
		} catch (error) {
			console.error("Error downloading file:", error);
			return c.json({ error: "Failed to download file" }, 500);
		}
	});

	// Delete backup(s)
	app.delete("/api/backups", validateToken, async (c) => {
		try {
			const { ids } = await c.req.json();

			if (!ids || !Array.isArray(ids) || ids.length === 0) {
				return c.json({ error: "Backup IDs are required" }, 400);
			}

			// Delete backups (files will be cascaded)
			await prisma.backup.deleteMany({
				where: { id: { in: ids } },
			});

			return c.json({ success: true, deleted: ids.length });
		} catch (error) {
			console.error("Error deleting backups:", error);
			return c.json({ error: "Failed to delete backups" }, 500);
		}
	});
}
