import { getPrismaClient, validateToken } from "@/lib/server/api-helpers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// GET /api/backup/by-name - Get all backups with a specific name for a client
export async function GET(request: NextRequest) {
	try {
		// Authenticate the request
		const validation = await validateToken(request);
		if ("error" in validation) {
			return NextResponse.json(
				{ error: validation.error },
				{ status: validation.status },
			);
		}

		const prisma = getPrismaClient();
		const { searchParams } = new URL(request.url);
		const clientId = searchParams.get("clientId");
		const backupName = searchParams.get("backupName");

		if (!clientId || !backupName) {
			return NextResponse.json(
				{ error: "clientId and backupName are required" },
				{ status: 400 },
			);
		}

		// Get all backups with this name
		const backups = await prisma.backup.findMany({
			where: {
				clientId,
				backupName,
			},
			orderBy: {
				createdAt: "desc",
			},
			include: {
				client: {
					select: {
						id: true,
						name: true,
						email: true,
					},
				},
				_count: {
					select: {
						files: true,
					},
				},
			},
		});

		// Map the backups to include filesCount and convert BigInt to string
		const backupsWithCount = backups.map((backup) => ({
			...backup,
			filesCount: backup._count.files,
			totalSize: backup.totalSize ? backup.totalSize.toString() : "0",
		}));

		return NextResponse.json({ data: backupsWithCount });
	} catch (error) {
		console.error("Error fetching backups by name:", error);
		return NextResponse.json(
			{ error: "Failed to fetch backups" },
			{ status: 500 },
		);
	}
}
