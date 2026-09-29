import {
	badge,
	button,
	codeBlock,
	COLORS,
	detailsTable,
	escapeHtml,
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

export interface FailedRun {
	startedAt: Date | null;
	failedAt: Date;
	error: string | null;
}

interface BackupFailedOptions {
	agentName: string;
	jobName: string;
	lastSuccessAt: Date | null;
	/** Newest first. */
	runs: FailedRun[];
	appUrl: string | null;
}

export function renderBackupFailedEmail({
	agentName,
	jobName,
	lastSuccessAt,
	runs,
	appUrl,
}: BackupFailedOptions): RenderedMail {
	const [latest, ...older] = runs;
	if (!latest)
		throw new Error("renderBackupFailedEmail needs at least one run");
	const subject = `Backup failed: ${jobName} on ${agentName}`;
	const error = latest.error?.trim() || "No error message was reported.";

	const body = [
		badge("Failed", COLORS.destructive),
		`<div style="height:14px;line-height:14px;">&nbsp;</div>`,
		heading("A backup failed"),
		paragraph(
			`The job <strong>${escapeHtml(jobName)}</strong> on agent <strong>${escapeHtml(agentName)}</strong> didn't complete.`,
		),
		detailsTable([
			["Agent", escapeHtml(agentName)],
			["Job", escapeHtml(jobName)],
			...(latest.startedAt
				? ([["Started", escapeHtml(formatDate(latest.startedAt))]] as [
						string,
						string,
					][])
				: []),
			["Failed", escapeHtml(formatDate(latest.failedAt))],
			[
				"Last success",
				lastSuccessAt
					? escapeHtml(formatDate(lastSuccessAt))
					: `<span style="color:${COLORS.muted};">Never</span>`,
			],
		]),
		subheading("Error"),
		codeBlock(truncate(error, 2000)),
		older.length
			? [
					subheading(`Other failures (${older.length})`),
					jobList(
						older.map((run) => ({
							name: formatDate(run.failedAt),
							detailHtml: "",
							error: run.error ?? "No error message was reported.",
						})),
					),
				].join("\n")
			: "",
		appUrl ? button("View backups", `${appUrl}/backups`) : "",
		muted(
			"Only one failure email is sent per job within a short window, so repeated failures may be grouped together.",
		),
	].join("\n");

	const html = renderLayout({
		title: subject,
		preheader: truncate(error, 140),
		body,
	});

	const text = [
		subject,
		"",
		`Agent: ${agentName}`,
		`Job: ${jobName}`,
		...(latest.startedAt ? [`Started: ${formatDate(latest.startedAt)}`] : []),
		`Failed: ${formatDate(latest.failedAt)}`,
		`Last success: ${lastSuccessAt ? formatDate(lastSuccessAt) : "never"}`,
		"",
		"Error:",
		truncate(error, 2000),
		"",
		...(older.length
			? [
					`Other failures (${older.length}):`,
					...older.map(
						(run) =>
							`  - ${formatDate(run.failedAt)}: ${truncate(run.error ?? "no message", 200)}`,
					),
					"",
				]
			: []),
		...(appUrl ? [`View backups: ${appUrl}/backups`, ""] : []),
		TEXT_FOOTER,
	].join("\n");

	return { subject, html, text };
}
