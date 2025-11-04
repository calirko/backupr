import { Hono } from "hono";
import { cors } from "hono/cors";
import { PrismaClient } from "@prisma/client";
import { writeFile, mkdir, readFile, appendFile, unlink } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import { existsSync } from "fs";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";

const app = new Hono();
const prisma = new PrismaClient();

const BACKUP_STORAGE_DIR =
	process.env.BACKUP_STORAGE_DIR || join(process.cwd(), "backups");

// Global type for upload sessions
declare global {
	var uploadSessions: Map<string, any>;
}

global.uploadSessions = global.uploadSessions || new Map();

// Configure CORS with more permissive settings
app.use(
	"/*",
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "X-API-Key"],
		exposeHeaders: ["Content-Length", "Content-Type"],
		maxAge: 86400,
	}),
);

app.get("/", (c) => {
	return c.json({
		status: "ok",
		message: "Backupr Server is running",
		version: "2.0.0",
	});
});

const validateApiKey = async (c: any, next: any) => {
	const apiKey = c.req.header("X-API-Key");

	if (!apiKey) {
		return c.json({ error: "API key required" }, 401);
	}

	const client = await prisma.client.findUnique({
		where: { apiKey },
	});

	if (!client) {
		return c.json({ error: "Invalid API key" }, 401);
	}

	c.set("client", client);
	await next();
};

function calculateChecksum(buffer: Buffer): string {
	return createHash("sha256").update(buffer).digest("hex");
}

app.get("/api/ping", validateApiKey, async (c) => {
	try {
		const client = c.get("client");
		return c.json({
			success: true,
			message: "Connection successful",
			clientName: client.name,
			timestamp: new Date().toISOString(),
		});
	} catch (error: any) {
		return c.json({ error: "Ping failed", details: error.message }, 500);
	}
});

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

app.post("/api/backup/upload", validateApiKey, async (c) => {
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
		const pad = (n: number) => n.toString().padStart(2, "0");
		const d = timestamp.getDate();
		const m = timestamp.getMonth() + 1;
		const y = timestamp.getFullYear();
		const h = timestamp.getHours();
		const s = timestamp.getSeconds();
		// flat format without separators in order: day month year second hour
		const isoDate = `${pad(h)}:${pad(s)},${pad(d)}-${pad(m)}-${y}`;

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

				// Use ISO date as prefix: {isoDate}_{filename}
				const prefixedFileName = `${isoDate}_${file.name}`;
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
	} catch (error: any) {
		console.error("Backup error:", error);

		const client = c.get("client");
		if (client) {
			await prisma.syncLog.create({
				data: {
					clientId: client.id,
					action: "backup",
					status: "failed",
					message: error.message,
				},
			});
		}

		return c.json({ error: "Backup failed", details: error.message }, 500);
	}
});

// Chunked upload endpoints for large files
// Start a chunked upload session
app.post("/api/backup/upload/start", validateApiKey, async (c) => {
	try {
		const client = c.get("client");
		const body = await c.req.json();
		const { backupName, fileName, fileSize, totalChunks, metadata = {} } = body;

		if (!backupName || !fileName || !fileSize || !totalChunks) {
			return c.json(
				{
					error: "backupName, fileName, fileSize, and totalChunks are required",
				},
				400,
			);
		}

		const version = await getNextVersion(client.id, backupName);
		const timestamp = new Date();
		const pad = (n: number) => n.toString().padStart(2, "0");
		const d = timestamp.getDate();
		const m = timestamp.getMonth() + 1;
		const y = timestamp.getFullYear();
		const h = timestamp.getHours();
		const s = timestamp.getSeconds();
		const isoDate = `${pad(h)}:${pad(s)},${pad(d)}-${pad(m)}-${y}`;

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
	} catch (error: any) {
		console.error("Start upload error:", error);
		return c.json(
			{ error: "Failed to start upload", details: error.message },
			500,
		);
	}
});

// Upload a chunk
app.post("/api/backup/upload/chunk", validateApiKey, async (c) => {
	try {
		const formData = await c.req.formData();
		const sessionId = formData.get("sessionId") as string;
		const chunkIndex = parseInt(formData.get("chunkIndex") as string);
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
	} catch (error: any) {
		console.error("Chunk upload error:", error);
		return c.json(
			{ error: "Failed to upload chunk", details: error.message },
			500,
		);
	}
});

// Complete the chunked upload
app.post("/api/backup/upload/complete", validateApiKey, async (c) => {
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

		// Assemble chunks into final file
		const prefixedFileName = `${session.isoDate}_${session.fileName}`;
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
	} catch (error: any) {
		console.error("Complete upload error:", error);
		return c.json(
			{ error: "Failed to complete upload", details: error.message },
			500,
		);
	}
});

// Finalize the entire backup (after all files uploaded)
app.post("/api/backup/finalize", validateApiKey, async (c) => {
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
	} catch (error: any) {
		console.error("Finalize backup error:", error);
		return c.json(
			{ error: "Failed to finalize backup", details: error.message },
			500,
		);
	}
});

app.get("/api/backup/history", validateApiKey, async (c) => {
	try {
		const client = c.get("client");
		const limit = parseInt(c.req.query("limit") || "50");
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
	} catch (error: any) {
		return c.json(
			{ error: "Failed to fetch history", details: error.message },
			500,
		);
	}
});

app.get("/api/backup/names", validateApiKey, async (c) => {
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
	} catch (error: any) {
		return c.json(
			{ error: "Failed to fetch backup names", details: error.message },
			500,
		);
	}
});

app.get("/api/backup/:id", validateApiKey, async (c) => {
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
	} catch (error: any) {
		return c.json(
			{ error: "Failed to fetch backup", details: error.message },
			500,
		);
	}
});

app.get("/api/backup/:id/file/*", validateApiKey, async (c) => {
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
	} catch (error: any) {
		return c.json(
			{ error: "Failed to download file", details: error.message },
			500,
		);
	}
});

app.get("/api/logs", validateApiKey, async (c) => {
	try {
		const client = c.get("client");
		const limit = parseInt(c.req.query("limit") || "100");

		const logs = await prisma.syncLog.findMany({
			where: {
				clientId: client.id,
			},
			orderBy: {
				timestamp: "desc",
			},
			take: limit,
		});

		return c.json({ logs });
	} catch (error: any) {
		return c.json(
			{ error: "Failed to fetch logs", details: error.message },
			500,
		);
	}
});

const port = process.env.PORT || 3000;

console.log(`🚀 Backupr Server starting on port ${port}...`);
console.log(`📁 Backup storage directory: ${BACKUP_STORAGE_DIR}`);

process.on("SIGINT", async () => {
	await prisma.$disconnect();
	process.exit(0);
});

export default {
	port,
	fetch: app.fetch,
};
