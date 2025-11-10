import { PrismaClient } from "@prisma/client";
import type { Hono } from "hono";
import { createHash } from "node:crypto";
import {
	appendFile,
	mkdir,
	readFile,
	unlink,
	writeFile,
} from "node:fs/promises";
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

export function setupBackupChunkedRoutes(
	app: Hono,
	BACKUP_STORAGE_DIR: string,
) {
	// Start a chunked upload session
	app.post("/api/backup/upload/start", async (c: any) => {
		try {
			const client = c.get("client");
			const body = await c.req.json();
			const {
				backupName,
				fileName: rawFileName,
				fileSize,
				totalChunks,
				metadata = {},
			} = body;

			if (!backupName || !rawFileName || !fileSize || !totalChunks) {
				return c.json(
					{
						error:
							"backupName, fileName, fileSize, and totalChunks are required",
					},
					400,
				);
			}

			// Normalize filename: replace backslashes with forward slashes
			const fileName = rawFileName.replace(/\\/g, "/");

			const version = await getNextVersion(client.id, backupName);
			const timestamp = new Date();
			const isoDate = formatIsoDate(timestamp);

			// Create backup folder
			const backupFolder = join(BACKUP_STORAGE_DIR, client.name, backupName);
			await mkdir(backupFolder, { recursive: true });

			// Create temp folder for chunks
			const tempFolder = join(backupFolder, ".chunks", isoDate);
			await mkdir(tempFolder, { recursive: true });

			const uploadSession = {
				sessionId: `${Date.now()}_${Math.random().toString(36).substring(7)}`,
				backupName,
				fileName,
				fileSize,
				totalChunks,
				version,
				isoDate,
				clientId: client.id,
				tempFolder,
				uploadedChunks: 0,
			};

			// Store session in a simple in-memory map (in production, use Redis or database)
			global.uploadSessions = global.uploadSessions || new Map();
			global.uploadSessions.set(uploadSession.sessionId, uploadSession);

			return c.json({
				success: true,
				sessionId: uploadSession.sessionId,
				version,
				message: "Upload session created",
			});
		} catch (error) {
			console.error("Start upload error:", error);
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			return c.json(
				{ error: "Failed to start upload", details: errorMessage },
				500,
			);
		}
	});

	// Upload a chunk
	app.post("/api/backup/upload/chunk", async (c: any) => {
		try {
			const formData = await c.req.formData();
			const sessionId = formData.get("sessionId") as string;
			const chunkIndex = parseInt(formData.get("chunkIndex") as string, 10);
			const chunk = formData.get("chunk") as File;

			if (!sessionId || chunkIndex === undefined || !chunk) {
				return c.json(
					{
						error: "sessionId, chunkIndex, and chunk are required",
					},
					400,
				);
			}

			global.uploadSessions = global.uploadSessions || new Map();
			const session = global.uploadSessions.get(sessionId);

			if (!session) {
				return c.json({ error: "Invalid session ID" }, 404);
			}

			// Write chunk to temporary file
			const chunkPath = join(session.tempFolder, `chunk_${chunkIndex}`);
			const buffer = Buffer.from(await chunk.arrayBuffer());
			await writeFile(chunkPath, buffer);

			session.uploadedChunks++;

			return c.json({
				success: true,
				uploadedChunks: session.uploadedChunks,
				totalChunks: session.totalChunks,
			});
		} catch (error) {
			console.error("Chunk upload error:", error);
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			return c.json(
				{ error: "Failed to upload chunk", details: errorMessage },
				500,
			);
		}
	});

	// Complete the chunked upload
	app.post("/api/backup/upload/complete", async (c: any) => {
		try {
			const client = c.get("client");
			const body = await c.req.json();
			const { sessionId } = body;

			if (!sessionId) {
				return c.json({ error: "sessionId is required" }, 400);
			}

			global.uploadSessions = global.uploadSessions || new Map();
			const session = global.uploadSessions.get(sessionId);

			if (!session) {
				return c.json({ error: "Invalid session ID" }, 404);
			}

			// Verify all chunks are uploaded
			if (session.uploadedChunks !== session.totalChunks) {
				return c.json(
					{
						error: "Not all chunks uploaded",
						uploadedChunks: session.uploadedChunks,
						totalChunks: session.totalChunks,
					},
					400,
				);
			}

			// Create backup folder
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

			// Calculate checksum of final file
			const finalBuffer = await readFile(finalFilePath);
			const checksum = calculateChecksum(finalBuffer);
			const fileSize = finalBuffer.length;

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
						totalSize: 0,
						metadata: { isoDate: session.isoDate },
					},
				});
			}

			// Create file record
			await prisma.backupFile.create({
				data: {
					backupId: backup.id,
					filePath: prefixedFileName,
					fileSize: fileSize,
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
					totalSize: totalSize._sum.fileSize || 0,
				},
			});

			// Clean up session
			global.uploadSessions.delete(sessionId);

			return c.json({
				success: true,
				message: "File uploaded successfully",
				fileName: session.fileName,
				fileSize,
				checksum,
			});
		} catch (error) {
			console.error("Complete upload error:", error);
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			return c.json(
				{ error: "Failed to complete upload", details: errorMessage },
				500,
			);
		}
	});
}
