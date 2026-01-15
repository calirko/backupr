import { getPrismaClient, validateToken } from "@/lib/server/api-helpers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// GET /api/backup/grouped - Get backups grouped by client and backup name
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

		if (!clientId) {
			return NextResponse.json(
				{ error: "clientId is required" },
				{ status: 400 },
			);
		}

		// Get all unique backup names for this client
		const backupNames = await prisma.backup.findMany({
			where: {
				clientId,
			},
			distinct: ["backupName"],
			select: {
				backupName: true,
			},
		});

		// For each backup name, get statistics
		const groupedBackups = await Promise.all(
			backupNames.map(async (item) => {
				const backupName = item.backupName || "Unnamed";

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
						_count: {
							select: {
								files: true,
							},
						},
					},
				});

				// Calculate statistics
				const totalSize = backups.reduce((sum, backup) => {
					const size =
						typeof backup.totalSize === "bigint"
							? Number(backup.totalSize)
							: backup.totalSize;
					return sum + size;
				}, 0);

				const latestBackup = backups[0];

				return {
					backupName,
					totalBackups: backups.length,
					totalSize: totalSize.toString(),
					latestBackup: latestBackup
						? {
								id: latestBackup.id,
								version: latestBackup.version,
								status: latestBackup.status,
								createdAt: latestBackup.createdAt,
								filesCount: latestBackup._count.files,
								totalSize: latestBackup.totalSize.toString(),
							}
						: null,
				};
			}),
		);

		// Sort grouped backups by latest backup date (most recent first)
		groupedBackups.sort((a, b) => {
			if (!a.latestBackup && !b.latestBackup) return 0;
			if (!a.latestBackup) return 1;
			if (!b.latestBackup) return -1;
			return (
				new Date(b.latestBackup.createdAt).getTime() -
				new Date(a.latestBackup.createdAt).getTime()
			);
		});

		return NextResponse.json({ data: groupedBackups });
	} catch (error) {
		console.error("Error fetching grouped backups:", error);
		return NextResponse.json(
			{ error: "Failed to fetch grouped backups" },
			{ status: 500 },
		);
	}
}
