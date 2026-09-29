import { BackupStatus } from "../prisma/generated/prisma/enums";
import { prisma } from "./lib/prisma";
import { getMinIOFreeBytes } from "./lib/storage";
import { computeUptimePct } from "./lib/uptime";
import { appUrl, mailEnabled, sendMail } from "./mail/mail";
import type {
	JobHealth,
	WeeklyReportData,
} from "./mail/templates/weekly-report";
import { renderWeeklyReportEmail } from "./mail/templates/weekly-report";
import { STALE_AFTER_DAYS } from "./notifications";
import { agentRegistry } from "./ws.agent";

const db = prisma;

const DAY_MS = 24 * 60 * 60_000;
const TZ = process.env.TZ ?? "UTC";

function envInt(name: string, fallback: number, min: number, max: number) {
	const value = Number(process.env[name]);
	return Number.isInteger(value) && value >= min && value <= max
		? value
		: fallback;
}

/** Day of the week the report goes out (0 = Sunday … 6 = Saturday). */
const REPORT_DAY = envInt("WEEKLY_REPORT_DAY", 1, 0, 6);
/** Local hour (process TZ) the report goes out. */
const REPORT_HOUR = envInt("WEEKLY_REPORT_HOUR", 8, 0, 23);

/** The most recent scheduled report time at or before `now` (local time). */
export function latestReportSlot(now = new Date()): Date {
	const slot = new Date(now);
	slot.setHours(REPORT_HOUR, 0, 0, 0);
	slot.setDate(slot.getDate() - ((slot.getDay() - REPORT_DAY + 7) % 7));
	if (slot > now) slot.setDate(slot.getDate() - 7);
	return slot;
}

function startOfLocalDay(date: Date): Date {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

function addLocalDays(date: Date, days: number): Date {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
}

/** Local calendar day key (YYYY-MM-DD) in the server's TZ. */
function dayKey(date: Date): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: TZ,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}

function toNumber(value: bigint | number | null | undefined): number {
	return value == null ? 0 : Number(value);
}

// ─── Data ────────────────────────────────────────────────────────────────────

/** Collects everything that happened in [start, end). */
export async function buildWeeklyReport(
	start: Date,
	end: Date,
): Promise<WeeklyReportData> {
	const prevStart = new Date(
		start.getTime() - (end.getTime() - start.getTime()),
	);
	const window = { gte: start, lt: end };

	const [
		byJobStatus,
		prevByStatus,
		windowBackups,
		lastErrors,
		jobs,
		agents,
		statusRecords,
		baselines,
		storageTotals,
		freeBytes,
		storageByJob,
		jobsCreated,
		agentsCreated,
	] = await Promise.all([
		db.backup.groupBy({
			by: ["backup_job_id", "status"],
			where: { started_at: window },
			_count: { _all: true },
			_sum: { size_bytes: true },
		}),
		db.backup.groupBy({
			by: ["status"],
			where: { started_at: { gte: prevStart, lt: start } },
			_count: { _all: true },
			_sum: { size_bytes: true },
		}),
		// Only the columns needed for the per-day chart
		db.backup.findMany({
			where: {
				started_at: window,
				status: { in: [BackupStatus.COMPLETED, BackupStatus.FAILED] },
			},
			select: { started_at: true, status: true },
		}),
		db.backup.findMany({
			where: { started_at: window, status: BackupStatus.FAILED },
			orderBy: { completed_at: "desc" },
			distinct: ["backup_job_id"],
			select: { backup_job_id: true, error: true, completed_at: true },
		}),
		db.backupJob.findMany({
			where: { deleted_at: null, agent: { deleted_at: null } },
			select: {
				id: true,
				name: true,
				is_active: true,
				created_at: true,
				agent_id: true,
				agent: { select: { name: true, is_active: true } },
				backups: {
					where: { status: BackupStatus.COMPLETED },
					orderBy: { started_at: "desc" },
					take: 1,
					select: { started_at: true },
				},
			},
			orderBy: { name: "asc" },
		}),
		db.agent.findMany({
			where: { deleted_at: null },
			select: { id: true, name: true, is_active: true },
			orderBy: { name: "asc" },
		}),
		db.agentStatus.findMany({
			where: { date: window },
			orderBy: { date: "asc" },
			select: { agent_id: true, status: true, date: true },
		}),
		// Last status before the window, so its start isn't counted as downtime
		db.agentStatus.findMany({
			where: { date: { lt: start } },
			orderBy: { date: "desc" },
			distinct: ["agent_id"],
			select: { agent_id: true, status: true, date: true },
		}),
		db.backup.aggregate({
			where: { status: BackupStatus.COMPLETED },
			_sum: { size_bytes: true },
			_count: { _all: true },
		}),
		getMinIOFreeBytes(),
		db.backup.groupBy({
			by: ["backup_job_id"],
			where: { status: BackupStatus.COMPLETED, blob_key: { not: null } },
			_sum: { size_bytes: true },
			orderBy: { _sum: { size_bytes: "desc" } },
			take: 5,
		}),
		db.backupJob.count({ where: { deleted_at: null, created_at: window } }),
		db.agent.count({ where: { deleted_at: null, created_at: window } }),
	]);

	// Per-job counters for the window
	const jobStats = new Map<
		string,
		{ completed: number; failed: number; other: number; bytes: number }
	>();
	for (const row of byJobStatus) {
		const stats = jobStats.get(row.backup_job_id) ?? {
			completed: 0,
			failed: 0,
			other: 0,
			bytes: 0,
		};
		if (row.status === BackupStatus.COMPLETED) {
			stats.completed += row._count._all;
			stats.bytes += toNumber(row._sum.size_bytes);
		} else if (row.status === BackupStatus.FAILED) {
			stats.failed += row._count._all;
		} else {
			stats.other += row._count._all;
		}
		jobStats.set(row.backup_job_id, stats);
	}

	const sum = (
		pick: (s: {
			completed: number;
			failed: number;
			other: number;
			bytes: number;
		}) => number,
	) => [...jobStats.values()].reduce((n, s) => n + pick(s), 0);
	const completed = sum((s) => s.completed);
	const failed = sum((s) => s.failed);
	const runs = completed + failed + sum((s) => s.other);
	const bytes = sum((s) => s.bytes);

	const prev = { runs: 0, completed: 0, failed: 0, bytes: 0 };
	for (const row of prevByStatus) {
		prev.runs += row._count._all;
		if (row.status === BackupStatus.COMPLETED) {
			prev.completed += row._count._all;
			prev.bytes += toNumber(row._sum.size_bytes);
		}
		if (row.status === BackupStatus.FAILED) prev.failed += row._count._all;
	}

	// Per-day chart (local days), always 7 entries even when empty
	const days: WeeklyReportData["days"] = [];
	const dayIndex = new Map<string, number>();
	for (let date = start; date < end; date = addLocalDays(date, 1)) {
		const key = dayKey(date);
		if (dayIndex.has(key)) continue;
		dayIndex.set(key, days.length);
		days.push({ date, completed: 0, failed: 0 });
	}
	for (const b of windowBackups) {
		if (!b.started_at) continue;
		const i = dayIndex.get(dayKey(b.started_at));
		if (i === undefined) continue;
		if (b.status === BackupStatus.COMPLETED) days[i]!.completed++;
		else days[i]!.failed++;
	}

	// Jobs
	const errorByJob = new Map(lastErrors.map((e) => [e.backup_job_id, e]));
	const staleCutoff = new Date(end.getTime() - STALE_AFTER_DAYS * DAY_MS);
	const jobRows: WeeklyReportData["jobs"] = [];
	for (const job of jobs) {
		const stats = jobStats.get(job.id);
		// Paused jobs only show up if they actually ran this week
		if (!job.is_active && !stats) continue;

		const lastSuccessAt = job.backups[0]?.started_at ?? null;
		const lastError = errorByJob.get(job.id);
		let health: JobHealth;
		if (!job.is_active || !job.agent.is_active) health = "paused";
		else if ((lastSuccessAt ?? job.created_at) < staleCutoff) health = "stale";
		else if (
			lastError?.completed_at &&
			(!lastSuccessAt || lastError.completed_at > lastSuccessAt)
		)
			health = "failing";
		else if (!stats) health = "idle";
		else health = "healthy";

		jobRows.push({
			name: job.name,
			agentName: job.agent.name,
			runs: stats ? stats.completed + stats.failed + stats.other : 0,
			completed: stats?.completed ?? 0,
			failed: stats?.failed ?? 0,
			bytes: stats?.bytes ?? 0,
			lastSuccessAt,
			lastError: lastError?.error ?? null,
			health,
		});
	}

	// Agents
	const recordsByAgent = new Map<string, { status: string; date: Date }[]>();
	for (const b of baselines) recordsByAgent.set(b.agent_id, [b]);
	for (const r of statusRecords) {
		const list = recordsByAgent.get(r.agent_id) ?? [];
		list.push(r);
		recordsByAgent.set(r.agent_id, list);
	}
	const agentRows: WeeklyReportData["agents"] = agents.map((agent) => {
		const agentJobs = jobs.filter((j) => j.agent_id === agent.id);
		const records = recordsByAgent.get(agent.id);
		let agentRuns = 0;
		let agentFailed = 0;
		let agentBytes = 0;
		for (const job of agentJobs) {
			const stats = jobStats.get(job.id);
			if (!stats) continue;
			agentRuns += stats.completed + stats.failed + stats.other;
			agentFailed += stats.failed;
			agentBytes += stats.bytes;
		}
		return {
			name: agent.name,
			active: agent.is_active,
			online: agentRegistry.get(agent.id)?.status === "online",
			uptimePct: records?.length ? computeUptimePct(records, start, end) : null,
			activeJobs: agentJobs.filter((j) => j.is_active).length,
			runs: agentRuns,
			failed: agentFailed,
			bytes: agentBytes,
		};
	});

	// Largest jobs by stored data (all time)
	const jobById = new Map(jobs.map((j) => [j.id, j]));
	const largest = storageByJob
		.map((row) => {
			const job = jobById.get(row.backup_job_id);
			return job
				? {
						name: job.name,
						agentName: job.agent.name,
						bytes: toNumber(row._sum.size_bytes),
					}
				: null;
		})
		.filter(
			(row): row is NonNullable<typeof row> => row !== null && row.bytes > 0,
		);

	return {
		periodStart: start,
		periodEnd: end,
		totals: { runs, completed, failed, bytes },
		previous: prev,
		storage: {
			usedBytes: toNumber(storageTotals._sum.size_bytes),
			freeBytes: freeBytes == null ? null : Number(freeBytes),
			objects: storageTotals._count._all,
		},
		days,
		agents: agentRows,
		jobs: jobRows,
		largest,
		created: { jobs: jobsCreated, agents: agentsCreated },
		staleAfterDays: STALE_AFTER_DAYS,
	};
}

// ─── Delivery ────────────────────────────────────────────────────────────────

/** Sends the report for the last 7 days to a single address (manual send). */
export async function sendWeeklyReportNow(to: string): Promise<void> {
	// Today so far plus the 6 full days before it
	const end = new Date();
	const start = addLocalDays(startOfLocalDay(end), -6);
	const data = await buildWeeklyReport(start, end);
	await sendMail({ to, ...renderWeeklyReportEmail(data, appUrl()) });
}

/**
 * Runs every few minutes; once the weekly slot has passed, sends the report to
 * every opted-in user who hasn't received this week's copy yet. The per-user
 * timestamp makes it safe across restarts and lets failed sends retry.
 */
export async function sendDueWeeklyReports(): Promise<void> {
	if (!mailEnabled()) return;

	const now = new Date();
	const slot = latestReportSlot(now);
	// Don't send a stale report days late (e.g. server was down all Monday)
	if (now.getTime() - slot.getTime() > DAY_MS) return;

	const users = await db.user.findMany({
		where: {
			receive_weekly_report: true,
			deleted_at: null,
			OR: [
				{ weekly_report_sent_at: null },
				{ weekly_report_sent_at: { lt: slot } },
			],
		},
		select: { id: true, email: true },
	});
	if (users.length === 0) return;

	// The 7 full calendar days before the report day
	const end = startOfLocalDay(slot);
	const start = addLocalDays(end, -7);
	const data = await buildWeeklyReport(start, end);
	const mail = renderWeeklyReportEmail(data, appUrl());

	let sent = 0;
	for (const user of users) {
		try {
			await sendMail({ ...mail, to: user.email });
			// Raw update so the user's updated_at (shown in the UI) isn't bumped
			await db.$executeRaw`UPDATE "users" SET "weekly_report_sent_at" = ${now} WHERE "id" = ${user.id}`;
			sent++;
		} catch (err) {
			console.error(
				`[WeeklyReport] Failed to send to ${user.email}: ${err instanceof Error ? err.message : err}`,
			);
		}
	}
	console.log(
		`[WeeklyReport] Sent weekly report to ${sent}/${users.length} user(s)`,
	);
}
