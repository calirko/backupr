import { getPrismaClient, validateToken } from "@/lib/server/api-helpers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// GET /api/backup/clients - Get all clients with backup stats
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

		// Get all clients with their backup statistics
		const clients = await prisma.client.findMany({
			select: {
				id: true,
				name: true,
				email: true,
				_count: {
					select: {
						backups: true,
					},
				},
			},
			orderBy: {
				name: "asc",
			},
		});

		// For each client, get unique backup names, total size, and last backup date
		const clientsWithStats = await Promise.all(
			clients.map(async (client) => {
				const [uniqueBackupNames, allBackups, latestBackup] = await Promise.all(
					[
						prisma.backup.findMany({
							where: {
								clientId: client.id,
							},
							distinct: ["backupName"],
							select: {
								backupName: true,
							},
						}),
						prisma.backup.findMany({
							where: {
								clientId: client.id,
							},
							select: {
								totalSize: true,
							},
						}),
						prisma.backup.findFirst({
							where: {
								clientId: client.id,
							},
							orderBy: {
								createdAt: "desc",
							},
							select: {
								createdAt: true,
							},
						}),
					],
				);

				// Calculate total size across all backups
				const totalSize = allBackups.reduce((sum, backup) => {
					const size =
						typeof backup.totalSize === "bigint"
							? Number(backup.totalSize)
							: backup.totalSize;
					return sum + size;
				}, 0);

				return {
					id: client.id,
					name: client.name,
					email: client.email,
					totalBackups: client._count.backups,
					uniqueBackupNames: uniqueBackupNames.length,
					totalSize: totalSize.toString(),
					lastBackupDate: latestBackup?.createdAt || null,
				};
			}),
		);

		return NextResponse.json({ clients: clientsWithStats });
	} catch (error) {
		console.error("Error fetching clients with backups:", error);
		return NextResponse.json(
			{ error: "Failed to fetch clients" },
			{ status: 500 },
		);
	}
}
