import { prisma } from "./lib/prisma";
import { removeObject } from "./lib/storage";

const db = prisma;

type ScheduledTask = {
	name: string;
	intervalMs: number;
	lastRun: Date | null;
	fn: () => Promise<void>;
};

class Scheduler {
	private tasks: ScheduledTask[] = [];
	private intervalHandle: ReturnType<typeof setInterval> | null = null;
	private readonly TICK_MS = 60_000; // 1 minute

	register(task: Omit<ScheduledTask, "lastRun">) {
		this.tasks.push({ ...task, lastRun: null });
	}

	start() {
		console.log("[Scheduler] Starting...");

		// Align the first tick to the next whole minute so cron checks are accurate
		const now = new Date();
		const msUntilNextMinute =
			this.TICK_MS - (now.getSeconds() * 1000 + now.getMilliseconds());

		setTimeout(() => {
			this.tick();
			this.intervalHandle = setInterval(() => this.tick(), this.TICK_MS);
		}, msUntilNextMinute);
	}

	stop() {
		if (this.intervalHandle) {
			clearInterval(this.intervalHandle);
			this.intervalHandle = null;
			console.log("[Scheduler] Stopped.");
		}
	}

	private async tick() {
		const now = new Date();

		for (const task of this.tasks) {
			const shouldRun =
				task.lastRun === null ||
				now.getTime() - task.lastRun.getTime() >= task.intervalMs;

			if (!shouldRun) continue;

			task.lastRun = now;

			try {
				console.log(`[Scheduler] Running task: ${task.name}`);
				await task.fn();
				console.log(`[Scheduler] Task completed: ${task.name}`);
			} catch (err) {
				console.error(`[Scheduler] Task failed: ${task.name}`, err);
			}
		}
	}
}

// ─── Task implementations ────────────────────────────────────────────────────

/**
 * Deletes UserSession rows whose expires_at is in the past.
 */
async function clearExpiredUserSessions(): Promise<void> {
	const now = new Date();

	const { count } = await db.userSession.deleteMany({
		where: {
			expires_at: {
				lt: now,
			},
		},
	});

	if (count > 0) {
		console.log(`[Scheduler] Cleared ${count} expired user session(s).`);
	}
}

/**
 * Deletes AgentCode rows that:
 *   - have an expires_at that is in the past, OR
 *   - have already been used (used_at is not null)
 *
 * AgentSession has no expiry by design, so we leave those alone.
 */
async function clearExpiredAgentCodes(): Promise<void> {
	const now = new Date();

	const { count } = await db.agentCode.deleteMany({
		where: {
			OR: [
				// Code has a TTL and it has elapsed
				{
					expires_at: {
						lt: now,
					},
				},
				// Code was already consumed
				{
					used_at: {
						not: null,
					},
				},
			],
		},
	});

	if (count > 0) {
		console.log(`[Scheduler] Cleared ${count} expired/used agent code(s).`);
	}
}

/**
 * Evaluates active BackupJob rows and triggers any whose cron expression
 * indicates they are due.
 *
 * NOTE: Actual backup execution is a stub — only the scheduling logic lives here.
 */
async function triggerDueBackups(): Promise<void> {
	const now = new Date();

	const activeJobs = await db.backupJob.findMany({
		where: { is_active: true, deleted_at: null },
		include: {
			// Pull the most recent backup so we can compare against it
			backups: {
				orderBy: { started_at: "desc" },
				take: 1,
			},
		},
	});

	for (const job of activeJobs) {
		const isDue = isCronDue(job.cron, job.backups[0]?.started_at ?? null, now);

		if (!isDue) continue;

		console.log(
			`[Scheduler] Triggering backup for job ${job.id} (cron: ${job.cron})`,
		);

		await triggerBackup(job.id);
	}
}

/**
 * Initializes a backup for the given job.
 * This is the main entry point for starting backups from the scheduler.
 */
async function triggerBackup(jobId: string): Promise<void> {
	try {
		const { sendStartBackupCommand } = await import("./backup");
		await sendStartBackupCommand(jobId);
		console.log(`[Scheduler] Backup initiated for job ${jobId}.`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		// Agent offline is expected; anything else is worth logging as an error
		if (message.includes("not online")) {
			console.log(`[Scheduler] Skipping job ${jobId}: agent not online.`);
		} else {
			console.error(
				`[Scheduler] Failed to initiate backup for job ${jobId}:`,
				message,
			);
		}
	}
}

// ─── Cron helpers ────────────────────────────────────────────────────────────

/**
 * Very lightweight cron-due check.
 *
 * Parses a standard 5-field cron expression (minute hour dom month dow) and
 * decides whether `now` falls within the same "minute slot" as the expression
 * AND the last run was not within that same slot.
 *
 * Supported syntax:
 *   *        – every unit
 *   n        – exact value
 *   n/s      – every s steps starting from n  (e.g. 0/15)
 *   n-m      – inclusive range
 *   a,b,c    – list of values
 *
 * This is intentionally minimal — for production use consider a library like
 * `croner` or `node-cron`.
 */
function isCronDue(
	expression: string,
	lastRun: Date | null,
	now: Date,
): boolean {
	const fields = expression.trim().split(/\s+/);
	if (fields.length !== 5) {
		console.warn(`[Scheduler] Invalid cron expression: "${expression}"`);
		return false;
	}

	const [minuteField, hourField, domField, monthField, dowField] = fields as [
		string,
		string,
		string,
		string,
		string,
	];

	const minute = now.getMinutes();
	const hour = now.getHours();
	const dom = now.getDate();
	const month = now.getMonth() + 1; // cron months are 1-based
	const dow = now.getDay(); // 0 = Sunday

	const matches =
		cronFieldMatches(minuteField, minute, 0, 59) &&
		cronFieldMatches(hourField, hour, 0, 23) &&
		cronFieldMatches(domField, dom, 1, 31) &&
		cronFieldMatches(monthField, month, 1, 12) &&
		cronFieldMatches(dowField, dow, 0, 6);

	if (!matches) return false;

	// Guard: don't fire again within the same calendar minute
	if (lastRun) {
		const sameMinute =
			lastRun.getFullYear() === now.getFullYear() &&
			lastRun.getMonth() === now.getMonth() &&
			lastRun.getDate() === now.getDate() &&
			lastRun.getHours() === now.getHours() &&
			lastRun.getMinutes() === now.getMinutes();

		if (sameMinute) return false;
	}

	return true;
}

function cronFieldMatches(
	field: string,
	value: number,
	min: number,
	max: number,
): boolean {
	// Handle comma-separated lists first
	if (field.includes(",")) {
		return field
			.split(",")
			.some((part) => cronFieldMatches(part.trim(), value, min, max));
	}

	// Wildcard
	if (field === "*") return true;

	// Step: */n or start/n
	if (field.includes("/")) {
		const parts = field.split("/");
		if (parts.length !== 2) return false;
		const [rangeOrStar, stepStr] = parts as [string, string];
		const step = parseInt(stepStr, 10);
		if (isNaN(step) || step <= 0) return false;

		let rangeMin = min;
		let rangeMax = max;

		if (rangeOrStar !== "*") {
			if (rangeOrStar.includes("-")) {
				const rangeParts = rangeOrStar.split("-").map(Number);
				if (
					rangeParts.length !== 2 ||
					isNaN(rangeParts[0] as number) ||
					isNaN(rangeParts[1] as number)
				)
					return false;
				rangeMin = rangeParts[0] as number;
				rangeMax = rangeParts[1] as number;
			} else {
				rangeMin = parseInt(rangeOrStar, 10);
				if (isNaN(rangeMin)) return false;
			}
		}

		for (let v = rangeMin; v <= rangeMax; v += step) {
			if (v === value) return true;
		}
		return false;
	}

	// Range: n-m
	if (field.includes("-")) {
		const rangeParts = field.split("-").map(Number);
		if (
			rangeParts.length !== 2 ||
			isNaN(rangeParts[0] as number) ||
			isNaN(rangeParts[1] as number)
		)
			return false;
		const [a, b] = rangeParts as [number, number];
		return value >= a && value <= b;
	}

	// Exact value
	const exact = parseInt(field, 10);
	return !isNaN(exact) && exact === value;
}

/**
 * Marks IN_PROGRESS backups as FAILED if they have been running for over 1 hour.
 */
async function timeoutStaleBackups(): Promise<void> {
	const cutoff = new Date(Date.now() - 60 * 60_000);

	const { count } = await db.backup.updateMany({
		where: {
			status: "IN_PROGRESS",
			started_at: { lt: cutoff },
		},
		data: {
			status: "FAILED",
			error: "Backup timed out after 1 hour with no completion.",
		},
	});

	if (count > 0) {
		console.log(
			`[Scheduler] Marked ${count} stale backup(s) as FAILED (timeout).`,
		);
	}
}

/**
 * Enforces retention policies across all backup jobs.
 * For each job, all attached policies are evaluated and the union of their
 * constraints is applied — whichever rule demands the most aggressive pruning wins.
 *
 * Rules:
 *   keep_last_n_backups  – delete COMPLETED backups beyond the N most recent
 *   max_backup_age_in_days – delete COMPLETED backups older than N days
 *
 * Storage objects (blob_key) are removed before the DB row so a crash never
 * leaves orphaned rows pointing at deleted blobs.
 */
async function enforceRetentionPolicies(): Promise<void> {
	const jobs = await db.backupJob.findMany({
		where: {
			deleted_at: null,
			backupJobPolicies: { some: { backup_policy: { deleted_at: null } } },
		},
		include: {
			backupJobPolicies: {
				where: { backup_policy: { deleted_at: null } },
				include: { backup_policy: true },
			},
		},
	});

	for (const job of jobs) {
		const policies = job.backupJobPolicies.map((bjp) => bjp.backup_policy);

		// Derive the strictest constraint across all attached policies
		const keepLastN = policies
			.map((p) => p.keep_last_n_backups)
			.filter((v): v is number => v !== null)
			.reduce<number | null>(
				(min, v) => (min === null ? v : Math.min(min, v)),
				null,
			);

		const maxAgeDays = policies
			.map((p) => p.max_backup_age_in_days)
			.filter((v): v is number => v !== null)
			.reduce<number | null>(
				(min, v) => (min === null ? v : Math.min(min, v)),
				null,
			);

		// Collect IDs to delete (only COMPLETED backups are eligible)
		const toDelete = new Set<string>();

		if (keepLastN !== null) {
			const backups = await db.backup.findMany({
				where: { backup_job_id: job.id, status: "COMPLETED" },
				orderBy: { started_at: "desc" },
				select: { id: true, blob_key: true },
			});

			for (const b of backups.slice(keepLastN)) {
				toDelete.add(b.id);
			}
		}

		if (maxAgeDays !== null) {
			const cutoff = new Date();
			cutoff.setDate(cutoff.getDate() - maxAgeDays);

			const backups = await db.backup.findMany({
				where: {
					backup_job_id: job.id,
					status: "COMPLETED",
					started_at: { lt: cutoff },
				},
				select: { id: true, blob_key: true },
			});

			for (const b of backups) {
				toDelete.add(b.id);
			}
		}

		if (toDelete.size === 0) continue;

		// Fetch blob_keys for the IDs we're about to delete
		const backupsToDelete = await db.backup.findMany({
			where: { id: { in: [...toDelete] } },
			select: { id: true, blob_key: true },
		});

		let deleted = 0;
		for (const backup of backupsToDelete) {
			if (backup.blob_key) {
				try {
					await removeObject(backup.blob_key);
				} catch (err) {
					console.error(
						`[Scheduler] Failed to remove storage object ${backup.blob_key}:`,
						err,
					);
					// Don't delete the DB row if storage removal fails — avoids orphaned references
					continue;
				}
			}

			await db.backup.delete({ where: { id: backup.id } });
			deleted++;
		}

		if (deleted > 0) {
			console.log(
				`[Scheduler] Pruned ${deleted} backup(s) for job ${job.id} (${job.name}).`,
			);
		}
	}
}

// ─── Singleton & bootstrap ───────────────────────────────────────────────────

const scheduler = new Scheduler();

scheduler.register({
	name: "clear-expired-user-sessions",
	intervalMs: 60_000, // every minute
	fn: clearExpiredUserSessions,
});

scheduler.register({
	name: "clear-expired-agent-codes",
	intervalMs: 60_000, // every minute
	fn: clearExpiredAgentCodes,
});

scheduler.register({
	name: "trigger-due-backups",
	intervalMs: 60_000, // every minute
	fn: triggerDueBackups,
});

scheduler.register({
	name: "timeout-stale-backups",
	intervalMs: 60_000, // every minute
	fn: timeoutStaleBackups,
});

scheduler.register({
	name: "enforce-retention-policies",
	intervalMs: 60 * 60_000, // every hour
	fn: enforceRetentionPolicies,
});

export { scheduler };
