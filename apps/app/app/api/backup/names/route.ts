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

		const backups = await prisma.backup.findMany({
			where: {
				clientId: client.id,
			},
			distinct: ["backupName"],
			select: {
				backupName: true,
			},
		});

		return NextResponse.json({
			backupNames: backups.map((b) => b.backupName).filter(Boolean),
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json(
			{ error: "Failed to fetch backup names", details: errorMessage },
			{ status: 500 }
		);
	}
}
