import { PrismaClient } from "@prisma/client";
import type { Hono } from "hono";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const prisma = new PrismaClient();

export function setupBackupFetchRoutes(app: Hono, BACKUP_STORAGE_DIR: string) {
	app.post("/api/backup/finalize", async (c: any) => {
		try {
			const client = c.get("client");
			const body = await c.req.json();
			const { backupName, version } = body;

			if (!backupName || !version) {
				return c.json({ error: "backupName and version are required" }, 400);
			}

			const backup = await prisma.backup.findFirst({
				where: {
					clientId: client.id,
					backupName,
					version,
				},
				include: {
					files: true,
				},
			});

			if (!backup) {
				return c.json({ error: "Backup not found" }, 404);
			}

			await prisma.backup.update({
				where: { id: backup.id },
				data: {
					status: "completed",
				},
			});

			await prisma.syncLog.create({
				data: {
					clientId: client.id,
					action: "backup",
					status: "success",
					message: `Backed up ${backup.filesCount} files (v${version})`,
					metadata: { backupId: backup.id, backupName, version },
				},
			});

			return c.json({
				success: true,
				message: "Backup finalized",
				backupId: backup.id,
				backupName,
				version,
				timestamp: backup.timestamp,
				filesCount: backup.filesCount,
				totalSize: backup.totalSize.toString(),
			});
		} catch (error) {
			console.error("Finalize backup error:", error);
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			return c.json(
				{ error: "Failed to finalize backup", details: errorMessage },
				500,
			);
		}
	});

	app.get("/api/backup/history", async (c: any) => {
		try {
			const client = c.get("client");
			const limit = parseInt(c.req.query("limit") || "50", 10);
			const backupName = c.req.query("backupName");

			const where: any = { clientId: client.id };
			if (backupName) {
				where.backupName = backupName;
			}

			const backups = await prisma.backup.findMany({
				where,
				orderBy: [{ backupName: "asc" }, { version: "desc" }],
				take: limit,
				include: {
					_count: {
						select: { files: true },
					},
				},
			});

			return c.json({
				backups: backups.map((b) => ({
					id: b.id,
					backupName: b.backupName,
					version: b.version,
					timestamp: b.timestamp,
					status: b.status,
					filesCount: b._count.files,
					totalSize: b.totalSize.toString(),
					metadata: b.metadata,
				})),
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			return c.json(
				{ error: "Failed to fetch history", details: errorMessage },
				500,
			);
		}
	});

	app.get("/api/backup/names", async (c: any) => {
		try {
			const client = c.get("client");

			const backups = await prisma.backup.findMany({
				where: {
					clientId: client.id,
				},
				distinct: ["backupName"],
				select: {
					backupName: true,
				},
			});

			return c.json({
				backupNames: backups.map((b) => b.backupName).filter(Boolean),
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			return c.json(
				{ error: "Failed to fetch backup names", details: errorMessage },
				500,
			);
		}
	});

	app.get("/api/backup/:id", async (c: any) => {
		try {
			const client = c.get("client");
			const id = c.req.param("id");

			const backup = await prisma.backup.findFirst({
				where: {
					id,
					clientId: client.id,
				},
				include: {
					files: true,
				},
			});

			if (!backup) {
				return c.json({ error: "Backup not found" }, 404);
			}

			return c.json({
				id: backup.id,
				backupName: backup.backupName,
				version: backup.version,
				timestamp: backup.timestamp,
				status: backup.status,
				filesCount: backup.filesCount,
				totalSize: backup.totalSize.toString(),
				metadata: backup.metadata,
				files: backup.files.map((f) => ({
					id: f.id,
					path: f.filePath,
					size: f.fileSize,
					checksum: f.checksum,
					status: f.status,
					uploadedAt: f.uploadedAt,
				})),
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			return c.json(
				{ error: "Failed to fetch backup", details: errorMessage },
				500,
			);
		}
	});

	app.get("/api/backup/:id/file/*", async (c: any) => {
		try {
			const client = c.get("client");
			const backupId = c.req.param("id");
			const filePath = c.req.path.split("/file/")[1];

			const backup = await prisma.backup.findFirst({
				where: {
					id: backupId,
					clientId: client.id,
				},
			});

			if (!backup) {
				return c.json({ error: "Backup not found" }, 404);
			}

			const fullPath = join(
				BACKUP_STORAGE_DIR,
				client.name,
				backup.backupName || "",
				filePath,
			);

			if (!existsSync(fullPath)) {
				return c.json({ error: "File not found" }, 404);
			}

			const fileBuffer = await readFile(fullPath);

			return new Response(fileBuffer, {
				headers: {
					"Content-Type": "application/octet-stream",
					"Content-Disposition": `attachment; filename="${filePath.split("/").pop()}"`,
				},
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			return c.json(
				{ error: "Failed to download file", details: errorMessage },
				500,
			);
		}
	});
}
