import { createHash } from "node:crypto";
import { getPrismaClient } from "./api-helpers";

export function calculateChecksum(buffer: Buffer): string {
	return createHash("sha256").update(buffer).digest("hex");
}

export async function getNextVersion(
	clientId: string,
	backupName: string
): Promise<number> {
	const prisma = getPrismaClient();
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
