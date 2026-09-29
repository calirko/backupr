import {
	badge,
	button,
	COLORS,
	escapeHtml,
	formatAgo,
	formatDate,
	heading,
	jobList,
	muted,
	paragraph,
	renderLayout,
	subheading,
	TEXT_FOOTER,
	truncate,
} from "./layout";
import type { RenderedMail } from "./types";

export interface StaleJob {
	name: string;
	lastSuccessAt: Date | null;
	createdAt: Date;
	lastFailure?: { at: Date; error: string | null } | null;
}

export interface StaleAgentGroup {
	agentName: string;
	online: boolean;
	lastSeenAt: Date | null;
	jobs: StaleJob[];
}

interface StaleJobsOptions {
	groups: StaleAgentGroup[];
	staleAfterDays: number;
	isReminder: boolean;
	appUrl: string | null;
}

function successLine(job: StaleJob): string {
	if (job.lastSuccessAt) {
		return `Last successful backup ${formatAgo(job.lastSuccessAt)} · ${formatDate(job.lastSuccessAt)}`;
	}
	return `Never completed a backup · created ${formatDate(job.createdAt)}`;
}

export function renderStaleJobsEmail({
	groups,
	staleAfterDays,
	isReminder,
	appUrl,
}: StaleJobsOptions): RenderedMail {
	const jobCount = groups.reduce((n, g) => n + g.jobs.length, 0);
	const jobsLabel = `${jobCount} backup job${jobCount === 1 ? "" : "s"}`;
	const verb = jobCount === 1 ? "hasn't" : "haven't";
	const subject = `${isReminder ? "Reminder: " : ""}${jobsLabel} ${verb} succeeded in ${staleAfterDays}+ days`;

	const sections = groups.map((group) => {
		const status = group.online
			? badge("Online", COLORS.greenish)
			: badge("Offline", COLORS.destructive);
		const seen = group.lastSeenAt
			? `<span style="font-family:'Inter', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;font-weight:400;font-size:12px;color:${COLORS.muted};">&nbsp; last seen ${escapeHtml(formatAgo(group.lastSeenAt))}</span>`
			: "";
		const rows = group.jobs.map((job) => ({
			name: job.name,
			detailHtml: escapeHtml(successLine(job)),
			error: job.lastFailure?.error
				? `Last failure (${formatDate(job.lastFailure.at)}): ${job.lastFailure.error}`
				: null,
		}));
		return [
			subheading(`${escapeHtml(group.agentName)} &nbsp;${status}${seen}`),
			jobList(rows),
		].join("\n");
	});

	const intro = isReminder
		? `This is a reminder: the ${jobsLabel} below still ${verb} completed a backup in more than ${staleAfterDays} days.`
		: `The ${jobsLabel} below ${verb} completed a backup in more than ${staleAfterDays} days.`;

	const body = [
		badge(isReminder ? "Reminder" : "Stale backups", COLORS.yellowish),
		`<div style="height:14px;line-height:14px;">&nbsp;</div>`,
		heading(isReminder ? "Backups are still stale" : "Backups need attention"),
		paragraph(escapeHtml(intro)),
		paragraph(
			"Check that the agents are online and that the jobs are running without errors.",
		),
		...sections,
		appUrl ? button("Open Backupr", `${appUrl}/backups`) : "",
		muted(
			"You'll keep getting reminders until each job completes a backup again.",
		),
	].join("\n");

	const html = renderLayout({
		title: subject,
		preheader: `${groups.map((g) => g.agentName).join(", ")}: ${jobsLabel} without a successful backup.`,
		body,
	});

	const text = [
		subject,
		"",
		intro,
		"",
		...groups.flatMap((group) => [
			`${group.agentName} (${group.online ? "online" : "offline"}${group.lastSeenAt ? `, last seen ${formatAgo(group.lastSeenAt)}` : ""})`,
			...group.jobs.flatMap((job) => [
				`  - ${job.name}: ${successLine(job)}`,
				...(job.lastFailure?.error
					? [`    Last failure: ${truncate(job.lastFailure.error, 200)}`]
					: []),
			]),
			"",
		]),
		...(appUrl ? [`Open Backupr: ${appUrl}/backups`, ""] : []),
		TEXT_FOOTER,
	].join("\n");

	return { subject, html, text };
}
