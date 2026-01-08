import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getPrismaClient, validateApiKey, getBackupStorageDir, errorResponse } from "@/lib/server/api-helpers";

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string; path: string[] }> }
) {
	try {
		const validation = await validateApiKey(request);
		if ("error" in validation) {
			return NextResponse.json(
				{ error: validation.error },
				{ status: validation.status }
			);
		}

		const { client } = validation;
		const prisma = getPrismaClient();
		const { id: backupId, path } = await params;
		const filePath = path.join("/");

		const backup = await prisma.backup.findFirst({
			where: {
				id: backupId,
				clientId: client.id,
			},
		});

		if (!backup) {
			return NextResponse.json({ error: "Backup not found" }, { status: 404 });
		}

		const BACKUP_STORAGE_DIR = getBackupStorageDir();
		const fullPath = join(
			BACKUP_STORAGE_DIR,
			client.name,
			backup.backupName || "",
			filePath
		);

		if (!existsSync(fullPath)) {
			return NextResponse.json({ error: "File not found" }, { status: 404 });
		}

		const fileBuffer = await readFile(fullPath);

		return new Response(fileBuffer, {
			headers: {
				"Content-Type": "application/octet-stream",
				"Content-Disposition": `attachment; filename="${filePath.split("/").pop()}"`,
			},
		});
	} catch (error) {
		return errorResponse(error, "Failed to download file");
	}
}
