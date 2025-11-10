import { PrismaClient } from "@prisma/client";
import type { Hono } from "hono";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const prisma = new PrismaClient();

function calculateChecksum(buffer: Buffer): string {
	return createHash("sha256").update(buffer).digest("hex");
}

async function getNextVersion(
	clientId: string,
	backupName: string,
): Promise<number> {
	const latestBackup = await prisma.backup.findFirst({
		where: {
			clientId,
			backupName,
		},
		orderBy: {
			version: "desc",
		},
	});

	return latestBackup ? latestBackup.version + 1 : 1;
}

function formatIsoDate(timestamp: Date): string {
	const pad = (n: number) => n.toString().padStart(2, "0");
	const d = timestamp.getDate();
	const m = timestamp.getMonth() + 1;
	const y = timestamp.getFullYear();
	const h = timestamp.getHours();
	const s = timestamp.getSeconds();
	return `${pad(h)}:${pad(s)},${pad(d)}-${pad(m)}-${y}`;
}

export function setupBackupUploadRoutes(app: Hono, BACKUP_STORAGE_DIR: string) {
	app.post("/api/backup/upload", async (c: any) => {
		try {
			const client = c.get("client");
			const formData = await c.req.formData();

			const backupName = formData.get("backupName") as string;
			const metadata = formData.get("metadata")
				? JSON.parse(formData.get("metadata") as string)
				: {};

			if (!backupName) {
				return c.json({ error: "backupName is required" }, 400);
			}

			const version = await getNextVersion(client.id, backupName);
			const timestamp = new Date();
			const isoDate = formatIsoDate(timestamp);

			// Create backup folder: backups/{clientName}/{backupName}/
			const backupFolder = join(BACKUP_STORAGE_DIR, client.name, backupName);
			await mkdir(backupFolder, { recursive: true });

			const backup = await prisma.backup.create({
				data: {
					clientId: client.id,
					backupName,
					version,
					status: "in_progress",
					filesCount: 0,
					totalSize: 0,
					metadata: { ...metadata, isoDate },
				},
			});

			const uploadedFiles = [];
			let totalSize = 0;

			for (const [key, value] of formData.entries()) {
				if (key.startsWith("file_")) {
					const file = value as File;
					const buffer = Buffer.from(await file.arrayBuffer());
					const checksum = calculateChecksum(buffer);

					// Normalize filename: replace backslashes with forward slashes and use ISO date as prefix
					// Also handle Windows short filenames (8.3 format) by cleaning invalid characters
					let normalizedFileName = file.name.replace(/\\/g, "/");

					// If filename looks like a Windows short name (contains ~), try to extract a meaningful name
					if (
						normalizedFileName.includes("~") &&
						normalizedFileName.length <= 12
					) {
						// Extract extension and create a more readable name
						const ext = normalizedFileName.split(".").pop();
						const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
						normalizedFileName = `file_${timestamp}.${ext}`;
					}

					const prefixedFileName = `${isoDate}_${normalizedFileName}`;
					const filePath = join(backupFolder, prefixedFileName);
					const fileDir = join(
						backupFolder,
						prefixedFileName.split("/").slice(0, -1).join("/"),
					);
					if (fileDir !== backupFolder) {
						await mkdir(fileDir, { recursive: true });
					}
					await writeFile(filePath, buffer);

					const fileRecord = await prisma.backupFile.create({
						data: {
							backupId: backup.id,
							filePath: prefixedFileName,
							fileSize: buffer.length,
							checksum,
							status: "uploaded",
						},
					});

					uploadedFiles.push(fileRecord);
					totalSize += buffer.length;
				}
			}

			await prisma.backup.update({
				where: { id: backup.id },
				data: {
					status: "completed",
					filesCount: uploadedFiles.length,
					totalSize,
				},
			});

			await prisma.syncLog.create({
				data: {
					clientId: client.id,
					action: "backup",
					status: "success",
					message: `Backed up ${uploadedFiles.length} files (v${version})`,
					metadata: { backupId: backup.id, backupName, version },
				},
			});

			return c.json({
				success: true,
				message: "Backup completed",
				backupId: backup.id,
				backupName,
				version,
				timestamp: backup.timestamp,
				filesCount: uploadedFiles.length,
				totalSize,
			});
		} catch (error) {
			console.error("Backup error:", error);

			const client = c.get("client");
			if (client) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				await prisma.syncLog.create({
					data: {
						clientId: client.id,
						action: "backup",
						status: "failed",
						message: errorMessage,
					},
				});
			}

			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: "Backup failed", details: errorMessage }, 500);
		}
	});
}
