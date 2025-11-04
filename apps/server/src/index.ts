import { Hono } from "hono";
import { cors } from "hono/cors";
import { PrismaClient } from "@prisma/client";
import { writeFile, mkdir, readFile } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import { existsSync } from "fs";

const app = new Hono();
const prisma = new PrismaClient();

const BACKUP_STORAGE_DIR =
	process.env.BACKUP_STORAGE_DIR || join(process.cwd(), "backups");

app.use("/*", cors());

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
