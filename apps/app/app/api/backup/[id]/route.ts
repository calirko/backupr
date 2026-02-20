import {
	errorResponse,
	getPrismaClient,
	validateApiKey,
} from "@/lib/server/api-helpers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
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
		const { id } = await params;

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
			return NextResponse.json({ error: "Backup not found" }, { status: 404 });
		}

		return NextResponse.json({
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
				size: f.fileSize.toString(),
				checksum: f.checksum,
				status: f.status,
				uploadedAt: f.uploadedAt,
			})),
		});
	} catch (error) {
		return errorResponse(error, "Failed to fetch backup");
	}
}
