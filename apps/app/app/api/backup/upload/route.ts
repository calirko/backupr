import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getPrismaClient, validateApiKey, getBackupStorageDir, errorResponse } from "@/lib/server/api-helpers";
import { cleanupOldBackups } from "@/lib/server/backup-cleanup";
import { formatIsoDate } from "@/lib/server/formatter";
import { calculateChecksum, getNextVersion } from "@/lib/server/backup-helpers";

export async function POST(request: NextRequest) {
	let client: any = null;

	try {
		const validation = await validateApiKey(request);
		if ("error" in validation) {
			return NextResponse.json(
				{ error: validation.error },
				{ status: validation.status }
			);
		}

		client = validation.client;
		const prisma = getPrismaClient();
		const formData = await request.formData();

		const backupName = formData.get("backupName") as string;
		const metadata = formData.get("metadata")
			? JSON.parse(formData.get("metadata") as string)
			: {};

		if (!backupName) {
			return NextResponse.json({ error: "backupName is required" }, { status: 400 });
		}

		const version = await getNextVersion(client.id, backupName);
		const timestamp = new Date();
		const isoDate = formatIsoDate(timestamp);

		// Create backup folder: backups/{clientName}/{backupName}/
		const BACKUP_STORAGE_DIR = getBackupStorageDir();
		const backupFolder = join(BACKUP_STORAGE_DIR, client.name, backupName);
		await mkdir(backupFolder, { recursive: true });

		const backup = await prisma.backup.create({
			data: {
				clientId: client.id,
				backupName,
				version,
				status: "in_progress",
				filesCount: 0,
				totalSize: BigInt(0),
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
				if (normalizedFileName.includes("~") && normalizedFileName.length <= 12) {
					// Extract extension and create a more readable name
					const ext = normalizedFileName.split(".").pop();
					const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
					normalizedFileName = `file_${timestamp}.${ext}`;
				}

				const prefixedFileName = `${isoDate}_${normalizedFileName}`;
				const filePath = join(backupFolder, prefixedFileName);
				const fileDir = join(
					backupFolder,
					prefixedFileName.split("/").slice(0, -1).join("/")
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
				totalSize: BigInt(totalSize),
			},
		});

		// Clean up old backups if limit exceeded
		await cleanupOldBackups(
			client.id,
			backupName,
			BACKUP_STORAGE_DIR,
			client.name
		);

		await prisma.syncLog.create({
			data: {
				clientId: client.id,
				action: "backup",
				status: "success",
				message: `Backed up ${uploadedFiles.length} files (v${version})`,
				metadata: { backupId: backup.id, backupName, version },
			},
		});

		return NextResponse.json({
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

		if (client) {
			const prisma = getPrismaClient();
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			await prisma.syncLog.create({
				data: {
					clientId: client.id,
					action: "backup",
					status: "failed",
					message: errorMessage,
				},
			});
		}

		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json(
			{ error: "Backup failed", details: errorMessage },
			{ status: 500 }
		);
	}
}
