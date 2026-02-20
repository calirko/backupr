import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { getPrismaClient } from "./api-helpers";

export function calculateChecksum(buffer: Buffer): string {
	return createHash("sha256").update(buffer).digest("hex");
}

export function calculateChecksumFromFile(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = createHash("sha256");
		const stream = createReadStream(filePath);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("end", () => resolve(hash.digest("hex")));
		stream.on("error", reject);
	});
}

export async function getNextVersion(
	clientId: string,
	backupName: string,
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
