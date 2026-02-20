import {
	errorResponse,
	getBackupStorageDir,
	getPrismaClient,
	validateApiKey,
} from "@/lib/server/api-helpers";
import { cleanupOldBackups } from "@/lib/server/backup-cleanup";
import { calculateChecksumFromFile } from "@/lib/server/backup-helpers";
import { NextRequest, NextResponse } from "next/server";
import {
	appendFile,
	mkdir,
	readFile,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";

export async function POST(request: NextRequest) {
	try {
		const validation = await validateApiKey(request);
		if ("error" in validation) {
			return NextResponse.json(
				{ error: validation.error },
				{ status: validation.status },
			);
		}

		const { client } = validation;
		const prisma = getPrismaClient();
		const body = await request.json();
		const { sessionId } = body;

		if (!sessionId) {
			return NextResponse.json(
				{ error: "sessionId is required" },
				{ status: 400 },
			);
		}

		global.uploadSessions = global.uploadSessions || new Map();
		const session = global.uploadSessions.get(sessionId);

		if (!session) {
			return NextResponse.json(
				{ error: "Invalid session ID" },
				{ status: 404 },
			);
		}

		// Verify all chunks are uploaded
		if (session.uploadedChunks !== session.totalChunks) {
			return NextResponse.json(
				{
					error: "Not all chunks uploaded",
					uploadedChunks: session.uploadedChunks,
					totalChunks: session.totalChunks,
				},
				{ status: 400 },
			);
		}

		// Create backup folder
		const BACKUP_STORAGE_DIR = getBackupStorageDir();
		const backupFolder = join(
			BACKUP_STORAGE_DIR,
			client.name,
			session.backupName,
		);
		await mkdir(backupFolder, { recursive: true });

		// Assemble chunks into final file with normalized filename
		const normalizedFileName = session.fileName.replace(/\\/g, "/");
		const prefixedFileName = `${session.isoDate}_${normalizedFileName}`;
		const finalFilePath = join(backupFolder, prefixedFileName);

		// Create final file by concatenating chunks
		for (let i = 0; i < session.totalChunks; i++) {
			const chunkPath = join(session.tempFolder, `chunk_${i}`);
			const chunkData = await readFile(chunkPath);

			if (i === 0) {
				await writeFile(finalFilePath, chunkData);
			} else {
				await appendFile(finalFilePath, chunkData);
			}

			// Delete chunk file
			await unlink(chunkPath);
		}

		// Calculate checksum and size of final file without loading it into memory
		const [checksum, { size: fileSize }] = await Promise.all([
			calculateChecksumFromFile(finalFilePath),
			stat(finalFilePath),
		]);

		// Create or update backup record
		let backup = await prisma.backup.findFirst({
			where: {
				clientId: session.clientId,
				backupName: session.backupName,
				version: session.version,
			},
		});

		if (!backup) {
			backup = await prisma.backup.create({
				data: {
					clientId: session.clientId,
					backupName: session.backupName,
					version: session.version,
					status: "in_progress",
					filesCount: 0,
					totalSize: BigInt(0),
					metadata: { isoDate: session.isoDate },
				},
			});
		}

		// Create file record
		await prisma.backupFile.create({
			data: {
				backupId: backup.id,
				filePath: prefixedFileName,
				fileSize: BigInt(fileSize),
				checksum,
				status: "uploaded",
			},
		});

		// Update backup totals
		const fileCount = await prisma.backupFile.count({
			where: { backupId: backup.id },
		});
		const totalSize = await prisma.backupFile.aggregate({
			where: { backupId: backup.id },
			_sum: { fileSize: true },
		});

		await prisma.backup.update({
			where: { id: backup.id },
			data: {
				filesCount: fileCount,
				totalSize: BigInt(totalSize._sum.fileSize || 0),
				status: "completed",
			},
		});

		// Clean up old backups if limit exceeded
		await cleanupOldBackups(
			session.clientId,
			session.backupName,
			BACKUP_STORAGE_DIR,
			client.name,
		);

		// Clean up session
		global.uploadSessions.delete(sessionId);

		return NextResponse.json({
			success: true,
			message: "File uploaded successfully",
			fileName: session.fileName,
			fileSize,
			checksum,
		});
	} catch (error) {
		return errorResponse(error, "Failed to complete upload");
	}
}
