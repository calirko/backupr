import { NextRequest, NextResponse } from "next/server";
import { getPrismaClient, validateApiKey, errorResponse } from "@/lib/server/api-helpers";

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
		const prisma = getPrismaClient();
		const body = await request.json();
		const { backupName, version } = body;

		if (!backupName || !version) {
			return NextResponse.json(
				{ error: "backupName and version are required" },
				{ status: 400 }
			);
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
			return NextResponse.json({ error: "Backup not found" }, { status: 404 });
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

		return NextResponse.json({
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
		return errorResponse(error, "Failed to finalize backup");
	}
}
