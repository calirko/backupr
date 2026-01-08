import { NextRequest, NextResponse } from "next/server";
import { getPrismaClient, validateApiKey, errorResponse } from "@/lib/server/api-helpers";

export async function GET(request: NextRequest) {
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
		const { searchParams } = new URL(request.url);

		const limit = parseInt(searchParams.get("limit") || "50", 10);
		const backupName = searchParams.get("backupName");

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

		return NextResponse.json({
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
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json(
			{ error: "Failed to fetch history", details: errorMessage },
			{ status: 500 }
		);
	}
}
