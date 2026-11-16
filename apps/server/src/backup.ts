import { BackupStatus } from "../prisma/generated/prisma/enums";
import { prisma } from "./lib/prisma";
import { presignedDownloadUrl } from "./lib/storage";
import {
	clearStaleNotice,
	notifyBackupResults,
	notifyBackupsFailed,
} from "./notifications";
import { enforceRetentionForJob } from "./scheduler";
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
export async function sendStartBackupCommand(
	jobId: string,
	/** User who started it on demand; they get notified of the result. */
	triggeredById?: string,
): Promise<void> {
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
			requires_password: job.use_password,
			started_at: new Date(),
			triggered_by_id: triggeredById,
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
		notifyBackupsFailed([backup.id]);
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
	/** When set, the update is rejected unless the backup belongs to this agent. */
	agentId?: string,
): Promise<void> {
	const backup = await db.backup.findUnique({
		where: { id: backupId },
		include: { backup_job: true },
	});

	if (!backup) {
		console.warn(`[Backup] Backup record ${backupId} not found`);
		return;
	}

	if (agentId !== undefined && backup.backup_job.agent_id !== agentId) {
		console.warn(
			`[Backup] Agent ${agentId} tried to update backup ${backupId} it doesn't own`,
		);
		return;
	}

	// Object keys are always <agent>/<job>/<backup>; reject anything else so an
	// agent can't point a backup at someone else's blob.
	const expectedKey = `${backup.backup_job.agent_id}/${backup.backup_job_id}/${backup.id}`;
	if (metadata?.blob_key !== undefined && metadata.blob_key !== expectedKey) {
		console.warn(
			`[Backup] Ignoring unexpected blob_key for backup ${backupId}: ${metadata.blob_key}`,
		);
		metadata = { ...metadata, blob_key: undefined };
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
		const dateStr = new Date().toISOString().slice(0, 16).replace(/:/g, "-");
		const safeName = backup.backup_job.name
			.toLowerCase()
			.replace(/\s+/g, "_")
			.replace(/[^a-z0-9_]/g, "");
		const filename = `${safeName}_${dateStr}.7z`;
		try {
			updateData.url = await presignedDownloadUrl(
				metadata.blob_key,
				undefined,
				filename,
			);
		} catch (err) {
			console.error(
				`[Backup] Failed to generate presigned URL for ${backupId}:`,
				err,
			);
		}
	}

	await db.backup.update({
		where: { id: backupId },
		data: updateData,
	});

	console.log(`[Backup] Updated backup ${backupId} status to ${status}`);

	if (status === BackupStatus.FAILED) {
		notifyBackupsFailed([backupId]);
	}
	if (status === BackupStatus.COMPLETED) {
		notifyBackupResults([backupId]);
		clearStaleNotice(backup.backup_job_id).catch((err) =>
			console.error(
				`[Backup] Failed to clear stale notice for job ${backup.backup_job_id}:`,
				err,
			),
		);
	}

	// If completed, run the retention policy (deletes DB rows *and* storage objects)
	if (status === BackupStatus.COMPLETED) {
		try {
			await enforceRetentionForJob(backup.backup_job_id);
		} catch (error) {
			console.error(
				`[Backup] Failed to run policy for job ${backup.backup_job_id}:`,
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
	triggeredById?: string,
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
			requires_password: job.use_password,
			started_at: new Date(),
			triggered_by_id: triggeredById,
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
		notifyBackupsFailed([backup.id]);

		throw new Error(
			`Failed to send backup command: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
