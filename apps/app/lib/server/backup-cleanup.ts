import { rm } from "node:fs/promises";
import { join } from "node:path";
import { getPrismaClient } from "./api-helpers";

const MAX_BACKUPS_PER_ENTRY = 20;

export async function cleanupOldBackups(
	clientId: string,
	backupName: string,
	storageDir: string,
	clientName: string,
): Promise<void> {
	const prisma = getPrismaClient();

	// Get all backups for this client and backup name, ordered by version descending
	const backups = await prisma.backup.findMany({
		where: {
			clientId,
			backupName,
			status: "completed",
		},
		orderBy: {
			version: "desc",
		},
		include: {
			files: true,
		},
	});

	// If we have more than the max allowed, delete the oldest ones
	if (backups.length >= MAX_BACKUPS_PER_ENTRY) {
		const backupsToDelete = backups.slice(MAX_BACKUPS_PER_ENTRY - 1);

		for (const backup of backupsToDelete) {
			console.log(
				`Deleting old backup: ${backupName} v${backup.version} (id: ${backup.id})`,
			);

			// Delete files from filesystem
			for (const file of backup.files) {
				try {
					const filePath = join(
						storageDir,
						clientName,
						backupName,
						file.filePath,
					);
					await rm(filePath, { force: true });
					console.log(`Deleted file: ${filePath}`);
				} catch (error) {
					console.error(`Failed to delete file ${file.filePath}:`, error);
				}
			}

			// Delete backup record from database (cascade will delete files)
			await prisma.backup.delete({
				where: { id: backup.id },
			});

			console.log(`Deleted backup record: ${backup.id}`);
		}

		console.log(
			`Cleanup complete: Deleted ${backupsToDelete.length} old backup(s) for ${backupName}`,
		);
	}
}
