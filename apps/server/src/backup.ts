import { BackupStatus } from "../prisma/generated/prisma/enums";
import { prisma } from "./lib/prisma";
import { presignedDownloadUrl } from "./lib/storage";
import { agentRegistry } from "./ws.agent";

const db = prisma;

interface BackupJobPayload {
	id: string; // backup ID
	jobId: string; // backup job ID (needed for upload)
	jobName: string; // used for naming the stored file
	files: string[];
	compression_level: number;
	use_password: boolean;
	password?: string;
}

/**
 * Sends a backup command to the specified agent via WebSocket.
 * The agent must be online for this to succeed.
 */
export async function sendStartBackupCommand(jobId: string): Promise<void> {
	// 1. Fetch the job details
	const job = await db.backupJob.findFirst({
		where: { id: jobId, deleted_at: null },
		include: { agent: true },
	});

	if (!job) {
		throw new Error(`Backup job ${jobId} not found`);
	}

	// 2. Check if agent is online
	const agentState = agentRegistry.get(job.agent_id);
	if (!agentState || agentState.status !== "online") {
		throw new Error(
			`Agent ${job.agent_id} for job ${jobId} is not online. Cannot send backup command.`,
		);
	}

	// 3. Create PENDING backup record
	const backup = await db.backup.create({
		data: {
			backup_job_id: jobId,
			status: BackupStatus.PENDING,
			started_at: new Date(),
		},
	});

	console.log(`[Backup] Created backup record ${backup.id} for job ${jobId}`);

	// 4. Build the payload for the agent
	const payload: BackupJobPayload = {
		id: backup.id,
		jobId: jobId,
		jobName: job.name,
		files: job.files,
		compression_level: job.compression_level,
		use_password: job.use_password,
		password: job.password || undefined,
	};

	// 5. Send the command to the agent
	try {
		agentState.websocket.send(
			JSON.stringify({
				type: "start_backup",
				backupJob: payload,
			}),
		);
		console.log(
			`[Backup] Sent start_backup command for backup ${backup.id} to agent ${job.agent_id}`,
		);
	} catch (error) {
		// If sending fails, mark the backup as failed
		await db.backup.update({
			where: { id: backup.id },
			data: {
				status: BackupStatus.FAILED,
				error: `Failed to send backup command to agent: ${error instanceof Error ? error.message : String(error)}`,
				completed_at: new Date(),
			},
		});
		throw error;
	}
}

/**
 * Handles status updates from the agent about an ongoing backup.
 * Updates the backup record in the database.
 */
export async function handleBackupStatusUpdate(
	backupId: string,
	status: BackupStatus,
	metadata?: {
		size_bytes?: bigint;
		error?: string;
		blob_key?: string;
		url?: string;
	},
): Promise<void> {
	const backup = await db.backup.findUnique({
		where: { id: backupId },
		include: { backup_job: true },
	});

	if (!backup) {
		console.warn(`[Backup] Backup record ${backupId} not found`);
		return;
	}

	// Build update data, only including non-undefined values
	const updateData: Record<string, any> = {
		status,
	};

	if (metadata?.size_bytes !== undefined) {
		updateData.size_bytes = metadata.size_bytes;
	}
	if (metadata?.error !== undefined) {
		updateData.error = metadata.error;
	}
	if (metadata?.blob_key !== undefined) {
		updateData.blob_key = metadata.blob_key;
	}

	// Set completed_at if backup is finished
	if (status === BackupStatus.COMPLETED || status === BackupStatus.FAILED) {
		updateData.completed_at = new Date();
	}

	// Generate a proper presigned URL server-side so the filename is set correctly
	if (status === BackupStatus.COMPLETED && metadata?.blob_key) {
		const filename = `${backup.backup_job.name}.7z`;
		try {
			updateData.url = await presignedDownloadUrl(metadata.blob_key, undefined, filename);
		} catch (err) {
			console.error(`[Backup] Failed to generate presigned URL for ${backupId}:`, err);
		}
	}

	await db.backup.update({
		where: { id: backupId },
		data: updateData,
	});

	console.log(`[Backup] Updated backup ${backupId} status to ${status}`);

	// If completed, run the retention policy
	if (status === BackupStatus.COMPLETED) {
		try {
			await runBackupPolicy(backup.backup_job_id);
		} catch (error) {
			console.error(
				`[Backup] Failed to run policy for job ${backup.backup_job_id}:`,
				error,
			);
		}
	}
}

/**
 * Executes the retention policy for a backup job.
 * This includes:
 * - Deleting backups exceeding the keep_last_n_backups limit
 * - Deleting backups older than max_backup_age_in_days
 */
export async function runBackupPolicy(jobId: string): Promise<void> {
	// 1. Fetch all policies associated with this job
	const jobPolicies = await db.backupJobPolicy.findMany({
		where: { backup_job_id: jobId, backup_policy: { deleted_at: null } },
		include: { backup_policy: true },
	});

	if (jobPolicies.length === 0) {
		console.log(`[Backup] No retention policies found for job ${jobId}`);
		return;
	}

	// 2. Get all backups for this job
	const backups = await db.backup.findMany({
		where: { backup_job_id: jobId },
		orderBy: { started_at: "desc" },
	});

	console.log(
		`[Backup] Running retention policy for job ${jobId} with ${backups.length} backups`,
	);

	const backupsToDelete: string[] = [];
	const now = new Date();

	// 3. Apply each policy
	for (const jobPolicy of jobPolicies) {
		const policy = jobPolicy.backup_policy;

		// Policy: keep_last_n_backups
		if (policy.keep_last_n_backups && policy.keep_last_n_backups > 0) {
			const backupsToKeep = backups.slice(0, policy.keep_last_n_backups);
			const backupsToRemove = backups.slice(policy.keep_last_n_backups);

			for (const backup of backupsToRemove) {
				if (!backupsToDelete.includes(backup.id)) {
					backupsToDelete.push(backup.id);
					console.log(
						`[Backup] Backup ${backup.id} exceeds keep_last_n_backups limit (${policy.keep_last_n_backups})`,
					);
				}
			}
		}

		// Policy: max_backup_age_in_days
		if (policy.max_backup_age_in_days && policy.max_backup_age_in_days > 0) {
			const cutoffDate = new Date(
				now.getTime() - policy.max_backup_age_in_days * 24 * 60 * 60 * 1000,
			);

			for (const backup of backups) {
				if (backup.started_at && backup.started_at < cutoffDate) {
					if (!backupsToDelete.includes(backup.id)) {
						backupsToDelete.push(backup.id);
						console.log(
							`[Backup] Backup ${backup.id} exceeds max_backup_age_in_days (${policy.max_backup_age_in_days} days)`,
						);
					}
				}
			}
		}
	}

	// 4. Delete the backups
	if (backupsToDelete.length > 0) {
		try {
			const result = await db.backup.deleteMany({
				where: { id: { in: backupsToDelete } },
			});

			console.log(
				`[Backup] Deleted ${result.count} backup(s) due to retention policy for job ${jobId}`,
			);

			// TODO: Delete the actual backup files from storage (MinIO/S3)
			// This requires coordination with the storage service
		} catch (error) {
			console.error(
				`[Backup] Failed to delete backups for job ${jobId}:`,
				error,
			);
		}
	}
}

/**
 * Initializes a backup job for immediate execution.
 * Can be called from API endpoints or scheduled tasks.
 *
 * Flow:
 * 1. Validate the job exists and is active
 * 2. Create a PENDING backup record in the database
 * 3. Send a WebSocket command to the agent to start the backup
 * 4. Agent receives the command and begins the backup process
 * 5. Agent emits status updates as it progresses
 * 6. When complete, the server runs the retention policy
 */
export async function initBackup(
	jobId: string,
	options?: {
		force?: boolean; // If true, allow backup even if job is inactive
	},
): Promise<{ backupId: string; jobId: string }> {
	// Validate the job exists
	const job = await db.backupJob.findFirst({
		where: { id: jobId, deleted_at: null },
		include: { agent: true },
	});

	if (!job) {
		throw new Error(`Backup job ${jobId} not found`);
	}

	if (!job.is_active && !options?.force) {
		throw new Error(`Backup job ${jobId} is not active`);
	}

	if (!job.agent) {
		throw new Error(`Backup job ${jobId} has no associated agent`);
	}

	// Check if agent is online
	const agentState = agentRegistry.get(job.agent_id);
	if (!agentState || agentState.status !== "online") {
		throw new Error(
			`Agent ${job.agent_id} for job ${jobId} is not online. Cannot start backup.`,
		);
	}

	// Create the backup record
	const backup = await db.backup.create({
		data: {
			backup_job_id: jobId,
			status: BackupStatus.PENDING,
			started_at: new Date(),
		},
	});

	console.log(
		`[Backup] Initialized backup ${backup.id} for job ${jobId} on agent ${job.agent_id}`,
	);

	// Build the payload for the agent
	const payload: BackupJobPayload = {
		id: backup.id,
		jobId: jobId,
		jobName: job.name,
		files: job.files,
		compression_level: job.compression_level,
		use_password: job.use_password,
		password: job.password || undefined,
	};

	// Send the command to the agent
	try {
		agentState.websocket.send(
			JSON.stringify({
				type: "start_backup",
				backupJob: payload,
			}),
		);

		console.log(
			`[Backup] Sent start_backup command for backup ${backup.id} to agent ${job.agent_id}`,
		);

		return { backupId: backup.id, jobId };
	} catch (error) {
		// If sending fails, mark the backup as failed
		await db.backup.update({
			where: { id: backup.id },
			data: {
				status: BackupStatus.FAILED,
				error: `Failed to send backup command to agent: ${error instanceof Error ? error.message : String(error)}`,
				completed_at: new Date(),
			},
		});

		throw new Error(
			`Failed to send backup command: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
