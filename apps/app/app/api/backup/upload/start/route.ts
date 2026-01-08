import { NextRequest, NextResponse } from "next/server";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { validateApiKey, getBackupStorageDir, errorResponse } from "@/lib/server/api-helpers";
import { formatIsoDate } from "@/lib/server/formatter";
import { getNextVersion } from "@/lib/server/backup-helpers";

export async function POST(request: NextRequest) {
	try {
		const validation = await validateApiKey(request);
		if ("error" in validation) {
			return NextResponse.json(
				{ error: validation.error },
				{ status: validation.status }
			);
		}

		const { client } = validation;
		const body = await request.json();
		const {
			backupName,
			fileName: rawFileName,
			fileSize,
			totalChunks,
			metadata = {},
		} = body;

		if (!backupName || !rawFileName || !fileSize || !totalChunks) {
			return NextResponse.json(
				{
					error: "backupName, fileName, fileSize, and totalChunks are required",
				},
				{ status: 400 }
			);
		}

		// Normalize filename: replace backslashes with forward slashes
		let fileName = rawFileName.replace(/\\/g, "/");

		// If filename looks like a Windows short name (contains ~), try to extract a meaningful name
		if (fileName.includes("~") && fileName.length <= 12) {
			// Extract extension and create a more readable name
			const ext = fileName.split(".").pop();
			const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
			fileName = `file_${timestamp}.${ext}`;
		}

		const version = await getNextVersion(client.id, backupName);
		const timestamp = new Date();
		const isoDate = formatIsoDate(timestamp);

		// Create backup folder
		const BACKUP_STORAGE_DIR = getBackupStorageDir();
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

		return NextResponse.json({
			success: true,
			sessionId: uploadSession.sessionId,
			version,
			message: "Upload session created",
		});
	} catch (error) {
		return errorResponse(error, "Failed to start upload");
	}
}
