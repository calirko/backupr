import { BackupStatus } from "../prisma/generated/prisma/enums";
import { prisma } from "./lib/prisma";
import {
	appUrl,
	logMailConfig,
	mailEnabled,
	sendToRecipients,
} from "./mail/mail";
import { renderBackupFailedEmail } from "./mail/templates/backup-failed";
import { formatBytes } from "./mail/templates/weekly-report";
import {
	renderStaleJobsEmail,
	type StaleAgentGroup,
} from "./mail/templates/stale-jobs";
import {
	logPushConfig,
	notifyUsers,
	pushAlertRecipients,
	pushEnabled,
} from "./push";
import { scheduler } from "./scheduler";
import { sendDueWeeklyReports } from "./weekly-report";
import { agentRegistry } from "./ws.agent";

const db = prisma;

function envNumber(name: string, fallback: number): number {
	const value = Number(process.env[name]);
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** A job is stale when it has had no successful backup for this many days. */
export const STALE_AFTER_DAYS = envNumber("STALE_AFTER_DAYS", 5);
/** While a job stays stale, a reminder is sent every this many days. */
const STALE_REMINDER_DAYS = envNumber("STALE_REMINDER_DAYS", 2);
/** At most one failure email per job within this window. */
const FAILURE_COOLDOWN_MINUTES = envNumber("FAILURE_COOLDOWN_MINUTES", 60);

const DAY_MS = 24 * 60 * 60_000;

// ─── Stale jobs ──────────────────────────────────────────────────────────────

/**
 * Finds active jobs with no successful backup in STALE_AFTER_DAYS and emails a
 * digest grouped by agent. The first warning goes out as soon as a job becomes
 * stale; after that a reminder is sent every STALE_REMINDER_DAYS until the job
 * succeeds again. When anything is due, the digest lists every stale job so the
 * recipient sees the full picture.
 */
export async function checkStaleJobs(): Promise<void> {
	const now = new Date();
	const staleCutoff = new Date(now.getTime() - STALE_AFTER_DAYS * DAY_MS);
	const reminderCutoff = new Date(now.getTime() - STALE_REMINDER_DAYS * DAY_MS);

	// Jobs that are no longer eligible (paused, deleted, agent disabled) stop
	// being tracked so they start fresh if they come back.
	await db.backupJob.updateMany({
		where: {
			stale_notified_at: { not: null },
			OR: [
				{ is_active: false },
				{ deleted_at: { not: null } },
				{
					agent: { OR: [{ is_active: false }, { deleted_at: { not: null } }] },
				},
			],
		},
		data: { stale_notified_at: null },
	});

	const jobs = await db.backupJob.findMany({
		where: {
			is_active: true,
			deleted_at: null,
			agent: { is_active: true, deleted_at: null },
		},
		select: {
			id: true,
			name: true,
			created_at: true,
			stale_notified_at: true,
			agent: {
				select: {
					id: true,
					name: true,
					agentSessions: {
						orderBy: { last_seen_at: "desc" },
						take: 1,
						select: { last_seen_at: true },
					},
				},
			},
			backups: {
				where: { status: BackupStatus.COMPLETED },
				orderBy: { started_at: "desc" },
				take: 1,
				select: { started_at: true },
			},
		},
	});

	const stale = jobs.filter((job) => {
		const lastSuccess = job.backups[0]?.started_at ?? job.created_at;
		return lastSuccess < staleCutoff;
	});

	// Jobs that recovered on their own get their warning state cleared.
	const recoveredIds = jobs
		.filter((job) => job.stale_notified_at && !stale.includes(job))
		.map((job) => job.id);
	if (recoveredIds.length) {
		await db.backupJob.updateMany({
			where: { id: { in: recoveredIds } },
			data: { stale_notified_at: null },
		});
	}

	if (stale.length === 0 || !(mailEnabled() || pushEnabled())) return;

	const due = stale.filter(
		(job) => !job.stale_notified_at || job.stale_notified_at < reminderCutoff,
	);
	if (due.length === 0) return;

	const isReminder = due.every((job) => job.stale_notified_at !== null);

	const lastFailures = await db.backup.findMany({
		where: {
			backup_job_id: { in: stale.map((job) => job.id) },
			status: BackupStatus.FAILED,
		},
		orderBy: { completed_at: "desc" },
		distinct: ["backup_job_id"],
		select: { backup_job_id: true, completed_at: true, error: true },
	});
	const failureByJob = new Map(lastFailures.map((b) => [b.backup_job_id, b]));

	const groups = new Map<string, StaleAgentGroup>();
	for (const job of stale) {
		let group = groups.get(job.agent.id);
		if (!group) {
			group = {
				agentName: job.agent.name,
				online: agentRegistry.get(job.agent.id)?.status === "online",
				lastSeenAt: job.agent.agentSessions[0]?.last_seen_at ?? null,
				jobs: [],
			};
			groups.set(job.agent.id, group);
		}
		const failure = failureByJob.get(job.id);
		group.jobs.push({
			name: job.name,
			lastSuccessAt: job.backups[0]?.started_at ?? null,
			createdAt: job.created_at,
			lastFailure: failure?.completed_at
				? { at: failure.completed_at, error: failure.error }
				: null,
		});
	}

	let sent = 0;
	if (mailEnabled()) {
		const mail = renderStaleJobsEmail({
			groups: [...groups.values()],
			staleAfterDays: STALE_AFTER_DAYS,
			isReminder,
			appUrl: appUrl(),
		});
		sent += await sendToRecipients(mail);
	}
	sent += await notifyUsers(await pushAlertRecipients(), {
		title: `${stale.length} backup job${stale.length === 1 ? "" : "s"} without a successful backup`,
		body: `${stale
			.slice(0, 3)
			.map((job) => job.name)
			.join(
				", ",
			)}${stale.length > 3 ? ` and ${stale.length - 3} more` : ""}: no successful backup in ${STALE_AFTER_DAYS}+ days.`,
		level: "warning",
		url: "/backups",
		tag: "stale-jobs",
	});
	if (sent === 0) return; // no recipients or nothing delivered: retry next run

	await db.backupJob.updateMany({
		where: { id: { in: stale.map((job) => job.id) } },
		data: { stale_notified_at: now },
	});
	console.log(
		`[Notifications] Sent stale-jobs ${isReminder ? "reminder" : "warning"} for ${stale.length} job(s) to ${sent} recipient(s)`,
	);
}

/** Called when a backup completes so the next stale warning starts fresh. */
export async function clearStaleNotice(jobId: string): Promise<void> {
	await db.backupJob.updateMany({
		where: { id: jobId, stale_notified_at: { not: null } },
		data: { stale_notified_at: null },
	});
}

// ─── Failed backups ──────────────────────────────────────────────────────────

/**
 * Emails the opted-in users about failed backups. Failures are grouped per job,
 * and each job gets at most one email per FAILURE_COOLDOWN_MINUTES; failures
 * suppressed by the cooldown are listed in the next email.
 */
async function sendFailureEmails(backupIds: string[]): Promise<void> {
	if (backupIds.length === 0 || !mailEnabled()) return;

	const failed = await db.backup.findMany({
		where: { id: { in: backupIds }, status: BackupStatus.FAILED },
		select: { backup_job_id: true },
	});
	const jobIds = [...new Set(failed.map((b) => b.backup_job_id))];

	const now = new Date();
	const cooldownCutoff = new Date(
		now.getTime() - FAILURE_COOLDOWN_MINUTES * 60_000,
	);

	for (const jobId of jobIds) {
		const job = await db.backupJob.findUnique({
			where: { id: jobId },
			select: {
				id: true,
				name: true,
				deleted_at: true,
				failure_notified_at: true,
				agent: { select: { name: true } },
			},
		});
		if (!job || job.deleted_at) continue;

		const previous = job.failure_notified_at;
		if (previous && previous > cooldownCutoff) continue;

		// Claim the slot atomically so concurrent failures don't double-send.
		const claimed = await db.backupJob.updateMany({
			where: { id: jobId, failure_notified_at: previous },
			data: { failure_notified_at: now },
		});
		if (claimed.count === 0) continue;

		const since = previous ?? new Date(now.getTime() - DAY_MS);
		const [runs, lastSuccess] = await Promise.all([
			db.backup.findMany({
				where: {
					backup_job_id: jobId,
					status: BackupStatus.FAILED,
					completed_at: { gt: since },
				},
				orderBy: { completed_at: "desc" },
				take: 10,
				select: { started_at: true, completed_at: true, error: true },
			}),
			db.backup.findFirst({
				where: { backup_job_id: jobId, status: BackupStatus.COMPLETED },
				orderBy: { started_at: "desc" },
				select: { started_at: true },
			}),
		]);
		if (runs.length === 0) continue;

		const mail = renderBackupFailedEmail({
			agentName: job.agent.name,
			jobName: job.name,
			lastSuccessAt: lastSuccess?.started_at ?? null,
			runs: runs.map((run) => ({
				startedAt: run.started_at,
				failedAt: run.completed_at ?? now,
				error: run.error,
			})),
			appUrl: appUrl(),
		});

		const sent = await sendToRecipients(mail);
		if (sent === 0) {
			// Nothing delivered: release the slot so the next failure can retry.
			await db.backupJob.updateMany({
				where: { id: jobId, failure_notified_at: now },
				data: { failure_notified_at: previous },
			});
			continue;
		}
		console.log(
			`[Notifications] Sent failure email for job "${job.name}" to ${sent} user(s)`,
		);
	}
}

/** Fire-and-forget: never throws and never blocks the caller. */
export function notifyBackupsFailed(backupIds: string[]): void {
	if (backupIds.length === 0) return;
	sendFailureEmails(backupIds).catch((err) =>
		console.error("[Notifications] Failed to send failure emails:", err),
	);
	notifyBackupResults(backupIds);
}

// ─── Backup results (toast + push) ───────────────────────────────────────────

/**
 * Tells the user who started a backup on demand how it went, and the users
 * with push alerts on about failures. Each backup is claimed once, since a
 * successful backup is reported both by the upload endpoint and the socket.
 */
async function sendBackupResults(backupIds: string[]): Promise<void> {
	const now = new Date();
	let alertRecipients: string[] | null = null;

	for (const id of backupIds) {
		const claimed = await db.backup.updateMany({
			where: {
				id,
				notified_at: null,
				status: { in: [BackupStatus.COMPLETED, BackupStatus.FAILED] },
			},
			data: { notified_at: now },
		});
		if (claimed.count === 0) continue;

		const backup = await db.backup.findUnique({
			where: { id },
			select: {
				status: true,
				error: true,
				size_bytes: true,
				triggered_by_id: true,
				backup_job: {
					select: { name: true, agent: { select: { name: true } } },
				},
			},
		});
		if (!backup) continue;

		const failed = backup.status === BackupStatus.FAILED;
		const recipients = backup.triggered_by_id ? [backup.triggered_by_id] : [];
		if (failed) {
			alertRecipients ??= await pushAlertRecipients();
			recipients.push(...alertRecipients);
		}
		if (recipients.length === 0) continue;

		const { name: jobName, agent } = backup.backup_job;
		await notifyUsers(recipients, {
			title: failed
				? `Backup failed: ${jobName}`
				: `Backup completed: ${jobName}`,
			body: failed
				? `${agent.name}: ${backup.error ?? "Unknown error"}`
				: `${agent.name}${backup.size_bytes != null ? ` · ${formatBytes(Number(backup.size_bytes))}` : ""}`,
			level: failed ? "error" : "success",
			url: "/backups",
			tag: `backup-${id}`,
		});
	}
}

/** Fire-and-forget: never throws and never blocks the caller. */
export function notifyBackupResults(backupIds: string[]): void {
	if (backupIds.length === 0) return;
	sendBackupResults(backupIds).catch((err) =>
		console.error("[Notifications] Failed to send backup results:", err),
	);
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

export function registerNotificationTasks(): void {
	logMailConfig();
	logPushConfig();

	scheduler.register({
		name: "check-stale-jobs",
		intervalMs: 60 * 60_000, // every hour
		fn: checkStaleJobs,
	});

	scheduler.register({
		name: "send-weekly-reports",
		intervalMs: 10 * 60_000, // checks every 10 min; sends once per week
		fn: sendDueWeeklyReports,
	});
}
