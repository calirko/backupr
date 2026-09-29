import {
	badge,
	button,
	COLORS,
	escapeHtml,
	formatAgo,
	heading,
	muted,
	paragraph,
	renderLayout,
	subheading,
	TEXT_FOOTER,
	truncate,
} from "./layout";
import type { RenderedMail } from "./types";

export type JobHealth = "healthy" | "failing" | "stale" | "idle" | "paused";

export interface WeeklyReportData {
	periodStart: Date;
	periodEnd: Date;
	totals: { runs: number; completed: number; failed: number; bytes: number };
	previous: { runs: number; completed: number; failed: number; bytes: number };
	storage: { usedBytes: number; freeBytes: number | null; objects: number };
	days: { date: Date; completed: number; failed: number }[];
	agents: {
		name: string;
		active: boolean;
		online: boolean;
		uptimePct: number | null;
		activeJobs: number;
		runs: number;
		failed: number;
		bytes: number;
	}[];
	jobs: {
		name: string;
		agentName: string;
		runs: number;
		completed: number;
		failed: number;
		bytes: number;
		lastSuccessAt: Date | null;
		lastError: string | null;
		health: JobHealth;
	}[];
	largest: { name: string; agentName: string; bytes: number }[];
	created: { jobs: number; agents: number };
	staleAfterDays: number;
}

const TZ = process.env.TZ ?? "UTC";
const MONO =
	"ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
const HEADING_FONT =
	"'Archivo Black', 'Arial Black', 'Inter', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// ─── Formatting ──────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
	if (!bytes || bytes < 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB", "PB"];
	const i = Math.min(
		Math.floor(Math.log(bytes) / Math.log(1024)),
		units.length - 1,
	);
	const value = bytes / 1024 ** i;
	return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

function formatShortDate(date: Date): string {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone: TZ,
		day: "numeric",
		month: "short",
	}).format(date);
}

function formatDayOfMonth(date: Date): string {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone: TZ,
		day: "numeric",
	}).format(date);
}

function formatWeekday(date: Date): string {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone: TZ,
		weekday: "short",
	}).format(date);
}

function formatPeriod(start: Date, end: Date): string {
	// `end` is exclusive, so show the last included day
	const last = new Date(end.getTime() - 1);
	return `${formatShortDate(start)} – ${formatShortDate(last)} ${new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric" }).format(last)}`;
}

function pct(part: number, total: number): number | null {
	return total > 0 ? (part / total) * 100 : null;
}

function formatPct(value: number | null): string {
	if (value === null) return "–";
	return value >= 99.95 || value === 0
		? `${Math.round(value)}%`
		: `${value.toFixed(1)}%`;
}

/** "▲ 12% vs last week" style delta; `goodWhenUp` controls the color. */
function delta(current: number, previous: number, goodWhenUp: boolean): string {
	if (previous === 0 && current === 0) {
		return `<span style="color:${COLORS.muted};">No change</span>`;
	}
	if (previous === 0) {
		return `<span style="color:${COLORS.muted};">New this week</span>`;
	}
	const change = ((current - previous) / previous) * 100;
	if (Math.abs(change) < 0.5) {
		return `<span style="color:${COLORS.muted};">Same as last week</span>`;
	}
	const up = change > 0;
	const good = up === goodWhenUp;
	return `<span style="color:${good ? COLORS.greenish : COLORS.destructive};">${up ? "▲" : "▼"} ${Math.abs(change).toFixed(0)}%</span><span style="color:${COLORS.muted};"> vs last week</span>`;
}

/** "+6 vs last week" for small counts where a percentage is misleading. */
function countDelta(current: number, previous: number): string {
	const diff = current - previous;
	if (diff === 0)
		return `<span style="color:${COLORS.muted};">Same as last week</span>`;
	return `<span style="color:${diff > 0 ? COLORS.destructive : COLORS.greenish};">${diff > 0 ? "+" : "−"}${Math.abs(diff)}</span><span style="color:${COLORS.muted};"> vs last week</span>`;
}

// ─── Building blocks ─────────────────────────────────────────────────────────

function tile(
	label: string,
	value: string,
	footHtml: string,
	valueColor: string = COLORS.foreground,
): string {
	return `<td valign="top" width="33%" style="width:33%;padding:4px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.inset};border:1px solid ${COLORS.border};border-radius:4px;">
    <tr><td style="padding:12px 14px;">
      <div style="font-size:11px;line-height:14px;letter-spacing:0.6px;text-transform:uppercase;color:${COLORS.muted};">${escapeHtml(label)}</div>
      <div style="padding-top:6px;font-family:${HEADING_FONT};font-size:22px;line-height:28px;color:${valueColor};white-space:nowrap;">${escapeHtml(value)}</div>
      <div style="padding-top:2px;font-size:11px;line-height:16px;">${footHtml}</div>
    </td></tr>
  </table>
</td>`;
}

function tileGrid(tiles: string[]): string {
	const rows: string[] = [];
	for (let i = 0; i < tiles.length; i += 3) {
		rows.push(`<tr>${tiles.slice(i, i + 3).join("")}</tr>`);
	}
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px 0;">${rows.join("\n")}</table>`;
}

/** Horizontal bar made of two table cells (works in every client). */
function hbar(fraction: number, color: string, height = 6): string {
	const filled = Math.max(0, Math.min(100, Math.round(fraction * 100)));
	const cells = [
		filled > 0
			? `<td width="${filled}%" bgcolor="${color}" style="width:${filled}%;height:${height}px;line-height:${height}px;font-size:0;background-color:${color};border-radius:3px;">&nbsp;</td>`
			: "",
		filled < 100
			? `<td style="height:${height}px;line-height:${height}px;font-size:0;">&nbsp;</td>`
			: "",
	].join("");
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.border}" style="background-color:${COLORS.border};border-radius:3px;"><tr>${cells}</tr></table>`;
}

/** Vertical stacked bar chart of completed/failed runs per day. */
function dailyChart(days: WeeklyReportData["days"]): string {
	const CHART_HEIGHT = 110;
	const max = Math.max(1, ...days.map((d) => d.completed + d.failed));
	if (days.every((d) => d.completed + d.failed === 0)) {
		return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.inset};border:1px solid ${COLORS.border};border-radius:4px;">
  <tr><td align="center" style="padding:28px 14px;font-size:13px;line-height:20px;color:${COLORS.muted};">No backups ran this week.</td></tr>
</table>`;
	}

	const bars = days
		.map((day) => {
			const total = day.completed + day.failed;
			const failedH = day.failed
				? Math.max(3, Math.round((day.failed / max) * CHART_HEIGHT))
				: 0;
			const completedH = day.completed
				? Math.max(3, Math.round((day.completed / max) * CHART_HEIGHT))
				: 0;
			const bar =
				total === 0
					? `<div style="height:2px;line-height:2px;font-size:0;background-color:${COLORS.border};border-radius:2px;">&nbsp;</div>`
					: [
							failedH
								? `<div style="height:${failedH}px;line-height:${failedH}px;font-size:0;background-color:${COLORS.destructive};border-radius:3px 3px 0 0;">&nbsp;</div>`
								: "",
							completedH
								? `<div style="height:${completedH}px;line-height:${completedH}px;font-size:0;background-color:${COLORS.greenish};border-radius:${failedH ? "0 0" : "3px 3px"} 0 0;">&nbsp;</div>`
								: "",
						].join("");
			return `<td valign="bottom" align="center" width="14%" style="width:14%;padding:0 3px;height:${CHART_HEIGHT + 20}px;">
  <div style="font-size:11px;line-height:16px;color:${total ? COLORS.foreground : COLORS.muted};padding-bottom:4px;">${total}</div>
  ${bar}
</td>`;
		})
		.join("\n");

	const labels = days
		.map(
			(
				day,
			) => `<td align="center" style="padding:8px 2px 0 2px;font-size:11px;line-height:14px;color:${COLORS.muted};">
  ${escapeHtml(formatWeekday(day.date))}<br /><span style="color:${COLORS.foreground};">${escapeHtml(formatDayOfMonth(day.date))}</span>
</td>`,
		)
		.join("\n");

	const legendDot = (color: string, label: string) =>
		`<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background-color:${color};"></span>&nbsp;<span style="color:${COLORS.muted};">${label}</span>`;

	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.inset};border:1px solid ${COLORS.border};border-radius:4px;">
  <tr><td style="padding:14px 10px 12px 10px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;">
      <tr>${bars}</tr>
      <tr>${labels}</tr>
    </table>
    <div style="padding:12px 5px 0 5px;font-size:11px;line-height:14px;">${legendDot(COLORS.greenish, "Completed")} &nbsp;&nbsp; ${legendDot(COLORS.destructive, "Failed")}</div>
  </td></tr>
</table>`;
}

const HEALTH: Record<
	JobHealth,
	{ label: string; color: string; rank: number }
> = {
	failing: { label: "Failing", color: COLORS.destructive, rank: 0 },
	stale: { label: "Stale", color: COLORS.yellowish, rank: 1 },
	idle: { label: "No runs", color: COLORS.blueish, rank: 2 },
	healthy: { label: "Healthy", color: COLORS.greenish, rank: 3 },
	paused: { label: "Paused", color: COLORS.muted, rank: 4 },
};

function th(label: string, align: "left" | "right" = "left", cls = ""): string {
	return `<th align="${align}" class="cell-sm ${cls}" style="padding:0 8px 8px 8px;font-size:11px;line-height:14px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:${COLORS.muted};border-bottom:1px solid ${COLORS.border};">${escapeHtml(label)}</th>`;
}

function td(
	html: string,
	align: "left" | "right" = "left",
	extra = "",
	cls = "",
): string {
	return `<td align="${align}" valign="middle" class="cell-sm ${cls}" style="padding:10px 8px;font-size:13px;line-height:18px;color:${COLORS.foreground};border-bottom:1px solid ${COLORS.border};${extra}">${html}</td>`;
}

function dataTable(head: string, rows: string[]): string {
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px 0;">
  <tr>${head}</tr>
  ${rows.join("\n")}
</table>`;
}

function sub(text: string): string {
	return `<div style="font-size:12px;line-height:16px;color:${COLORS.muted};">${text}</div>`;
}

// ─── Sections ────────────────────────────────────────────────────────────────

function agentsSection(allAgents: WeeklyReportData["agents"]): string {
	// Agents with nothing to back up would only add noise
	const agents = allAgents.filter((a) => a.activeJobs > 0 || a.runs > 0);
	const hidden = allAgents.length - agents.length;
	if (agents.length === 0) return "";
	const rows = agents.map((agent) => {
		const state = !agent.active
			? badge("Disabled", COLORS.muted)
			: agent.online
				? badge("Online", COLORS.greenish)
				: badge("Offline", COLORS.destructive);
		const uptime =
			agent.uptimePct === null
				? `<span style="color:${COLORS.muted};">No data</span>`
				: `<div style="padding-bottom:4px;">${formatPct(agent.uptimePct)}</div>${hbar(
						agent.uptimePct / 100,
						agent.uptimePct >= 99
							? COLORS.greenish
							: agent.uptimePct >= 90
								? COLORS.yellowish
								: COLORS.destructive,
					)}`;
		const runs = agent.failed
			? `${agent.runs}<div style="font-size:12px;color:${COLORS.destructive};">${agent.failed} failed</div>`
			: `${agent.runs}`;
		return `<tr>
  ${td(`<div style="font-weight:600;">${escapeHtml(agent.name)}</div>${sub(`${agent.activeJobs} active job${agent.activeJobs === 1 ? "" : "s"}`)}`)}
  ${td(state)}
  ${td(uptime, "left", "width:90px;")}
  ${td(runs, "right")}
  ${td(escapeHtml(formatBytes(agent.bytes)), "right", "white-space:nowrap;", "hide-sm")}
</tr>`;
	});
	return [
		subheading("Agents"),
		dataTable(
			th("Agent") +
				th("Now") +
				th("Uptime") +
				th("Runs", "right") +
				th("Data", "right", "hide-sm"),
			rows,
		),
		hidden
			? sub(
					`${hidden} other agent${hidden === 1 ? "" : "s"} without active jobs not shown.`,
				)
			: "",
	].join("\n");
}

function jobsSection(jobs: WeeklyReportData["jobs"]): string {
	if (jobs.length === 0) return "";
	const sorted = [...jobs].sort(
		(a, b) =>
			HEALTH[a.health].rank - HEALTH[b.health].rank ||
			a.name.localeCompare(b.name),
	);
	const rows = sorted.map((job) => {
		const h = HEALTH[job.health];
		const runs = job.runs
			? `<span style="color:${COLORS.greenish};">${job.completed}</span><span style="color:${COLORS.muted};"> / </span><span style="color:${job.failed ? COLORS.destructive : COLORS.muted};">${job.failed}</span>`
			: `<span style="color:${COLORS.muted};">0</span>`;
		const last = job.lastSuccessAt
			? escapeHtml(formatAgo(job.lastSuccessAt))
			: `<span style="color:${COLORS.muted};">Never</span>`;
		return `<tr>
  ${td(`<div style="font-weight:600;">${escapeHtml(job.name)}</div>${sub(escapeHtml(job.agentName))}`)}
  ${td(badge(h.label, h.color))}
  ${td(runs, "right", "white-space:nowrap;")}
  ${td(last, "right", "white-space:nowrap;", "hide-sm")}
</tr>`;
	});
	return [
		subheading("Jobs"),
		dataTable(
			th("Job") +
				th("Health") +
				th("OK / Failed", "right") +
				th("Last success", "right", "hide-sm"),
			rows,
		),
	].join("\n");
}

function attentionSection(
	jobs: WeeklyReportData["jobs"],
	staleAfterDays: number,
): string {
	const problems = jobs.filter(
		(j) => j.health === "failing" || j.health === "stale",
	);
	if (problems.length === 0) return "";
	const items = problems.map((job) => {
		const h = HEALTH[job.health];
		const reason =
			job.health === "stale"
				? job.lastSuccessAt
					? `No successful backup for ${formatAgo(job.lastSuccessAt).replace(" ago", "")} (limit ${staleAfterDays} days)`
					: "Has never completed a backup"
				: `${job.failed} failed run${job.failed === 1 ? "" : "s"} this week`;
		return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px 0;background-color:${COLORS.inset};border:1px solid ${COLORS.border};border-radius:4px;">
  <tr><td style="padding:12px 14px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="top" style="font-size:14px;line-height:20px;font-weight:600;color:${COLORS.foreground};">${escapeHtml(job.name)} <span style="font-weight:400;color:${COLORS.muted};">on ${escapeHtml(job.agentName)}</span></td>
      <td valign="top" align="right" style="padding-left:8px;">${badge(h.label, h.color)}</td>
    </tr></table>
    <div style="font-size:13px;line-height:20px;color:${COLORS.muted};">${escapeHtml(reason)}</div>
    ${job.lastError ? `<div style="margin-top:6px;font-family:${MONO};font-size:12px;line-height:18px;color:${COLORS.muted};white-space:pre-wrap;word-break:break-word;">${escapeHtml(truncate(job.lastError, 240))}</div>` : ""}
  </td></tr>
</table>`;
	});
	return [subheading(`Needs attention (${problems.length})`), ...items].join(
		"\n",
	);
}

function storageSection(data: WeeklyReportData): string {
	const { storage, largest } = data;
	const parts: string[] = [subheading("Storage")];

	if (storage.freeBytes !== null) {
		const total = storage.usedBytes + storage.freeBytes;
		const usedFrac = total > 0 ? storage.usedBytes / total : 0;
		parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px 0;">
  <tr>
    <td style="font-size:13px;line-height:18px;color:${COLORS.foreground};padding-bottom:6px;">${escapeHtml(formatBytes(storage.usedBytes))} used <span style="color:${COLORS.muted};">of ${escapeHtml(formatBytes(total))}</span></td>
    <td align="right" style="font-size:13px;line-height:18px;color:${COLORS.muted};padding-bottom:6px;">${escapeHtml(formatBytes(storage.freeBytes))} free</td>
  </tr>
  <tr><td colspan="2">${hbar(usedFrac, usedFrac > 0.9 ? COLORS.destructive : usedFrac > 0.75 ? COLORS.yellowish : COLORS.blueish, 8)}</td></tr>
</table>`);
	}

	if (largest.length) {
		const max = Math.max(...largest.map((l) => l.bytes));
		const rows = largest.map(
			(job) => `<tr>
  <td style="padding:6px 12px 6px 0;font-size:13px;line-height:18px;color:${COLORS.foreground};width:45%;">${escapeHtml(job.name)}${sub(escapeHtml(job.agentName))}</td>
  <td style="padding:6px 12px 6px 0;">${hbar(job.bytes / max, COLORS.blueish, 8)}</td>
  <td align="right" style="padding:6px 0;font-size:13px;line-height:18px;color:${COLORS.foreground};white-space:nowrap;width:64px;">${escapeHtml(formatBytes(job.bytes))}</td>
</tr>`,
		);
		parts.push(
			`<div style="font-size:12px;line-height:16px;color:${COLORS.muted};padding-bottom:4px;">Largest jobs by stored data</div>`,
			`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join("\n")}</table>`,
		);
	}

	return parts.length > 1 ? parts.join("\n") : "";
}

// ─── Email ───────────────────────────────────────────────────────────────────

export function renderWeeklyReportEmail(
	data: WeeklyReportData,
	appUrl: string | null,
): RenderedMail {
	const { totals, previous } = data;
	const period = formatPeriod(data.periodStart, data.periodEnd);
	const successRate = pct(totals.completed, totals.completed + totals.failed);
	const prevRate = pct(
		previous.completed,
		previous.completed + previous.failed,
	);
	const problems = data.jobs.filter(
		(j) => j.health === "failing" || j.health === "stale",
	);
	// Only agents that actually have work count towards "online"
	const workingAgents = data.agents.filter((a) => a.active && a.activeJobs > 0);
	const onlineAgents = workingAgents.filter((a) => a.online).length;
	const activeAgents = workingAgents.length;

	const subject = `Weekly report: ${totals.completed} backup${totals.completed === 1 ? "" : "s"}, ${totals.failed} failed · ${period}`;

	const summary =
		problems.length === 0
			? totals.runs === 0
				? "No backups ran this week."
				: "Everything looks good. All jobs are backing up normally."
			: `${problems.length} job${problems.length === 1 ? " needs" : "s need"} attention. See the details below.`;

	const rateDelta =
		successRate === null || prevRate === null
			? `<span style="color:${COLORS.muted};">${totals.completed + totals.failed} finished runs</span>`
			: Math.abs(successRate - prevRate) < 0.05
				? `<span style="color:${COLORS.muted};">Same as last week</span>`
				: `<span style="color:${successRate > prevRate ? COLORS.greenish : COLORS.destructive};">${successRate > prevRate ? "▲" : "▼"} ${Math.abs(successRate - prevRate).toFixed(1)} pts</span><span style="color:${COLORS.muted};"> vs last week</span>`;

	const tiles = tileGrid([
		tile(
			"Backups run",
			String(totals.runs),
			delta(totals.runs, previous.runs, true),
		),
		tile(
			"Success rate",
			formatPct(successRate),
			rateDelta,
			successRate === null
				? COLORS.muted
				: successRate >= 99
					? COLORS.greenish
					: successRate >= 90
						? COLORS.yellowish
						: COLORS.destructive,
		),
		tile(
			"Failed",
			String(totals.failed),
			countDelta(totals.failed, previous.failed),
			totals.failed ? COLORS.destructive : COLORS.foreground,
		),
		tile(
			"Data backed up",
			formatBytes(totals.bytes),
			delta(totals.bytes, previous.bytes, true),
		),
		tile(
			"Stored",
			formatBytes(data.storage.usedBytes),
			`<span style="color:${COLORS.muted};">${data.storage.objects} archive${data.storage.objects === 1 ? "" : "s"}</span>`,
		),
		tile(
			"Agents online",
			`${onlineAgents}/${activeAgents}`,
			`<span style="color:${COLORS.muted};">right now</span>`,
			onlineAgents === activeAgents ? COLORS.foreground : COLORS.yellowish,
		),
	]);

	const created: string[] = [];
	if (data.created.agents)
		created.push(
			`${data.created.agents} new agent${data.created.agents === 1 ? "" : "s"}`,
		);
	if (data.created.jobs)
		created.push(
			`${data.created.jobs} new job${data.created.jobs === 1 ? "" : "s"}`,
		);

	const body = [
		badge("Weekly report", COLORS.blueish),
		`<div style="height:14px;line-height:14px;">&nbsp;</div>`,
		heading(`Your week in backups`),
		`<p style="margin:-8px 0 16px 0;font-size:13px;line-height:20px;color:${COLORS.muted};">${escapeHtml(period)}</p>`,
		paragraph(
			`${escapeHtml(summary)}${created.length ? ` <span style="color:${COLORS.muted};">This week: ${escapeHtml(created.join(", "))}.</span>` : ""}`,
		),
		tiles,
		subheading("Daily activity"),
		dailyChart(data.days),
		attentionSection(data.jobs, data.staleAfterDays),
		agentsSection(data.agents),
		jobsSection(data.jobs),
		storageSection(data),
		appUrl ? button("Open dashboard", `${appUrl}/dashboard`) : "",
		muted(
			"Sent every week to users with the weekly report enabled. You can turn it off in Settings → Preferences.",
		),
	].join("\n");

	const html = renderLayout({
		title: subject,
		preheader: `${summary} ${totals.runs} runs, ${formatPct(successRate)} success, ${formatBytes(totals.bytes)} backed up.`,
		body,
	});

	const text = [
		`Backupr weekly report · ${period}`,
		"",
		summary,
		"",
		`Backups run:     ${totals.runs} (last week ${previous.runs})`,
		`Success rate:    ${formatPct(successRate)}`,
		`Failed:          ${totals.failed} (last week ${previous.failed})`,
		`Data backed up:  ${formatBytes(totals.bytes)}`,
		`Stored:          ${formatBytes(data.storage.usedBytes)} in ${data.storage.objects} archives${data.storage.freeBytes !== null ? ` (${formatBytes(data.storage.freeBytes)} free)` : ""}`,
		`Agents online:   ${onlineAgents}/${activeAgents}`,
		"",
		"Daily activity (completed / failed):",
		...data.days.map(
			(d) =>
				`  ${formatWeekday(d.date)} ${formatShortDate(d.date)}: ${d.completed} / ${d.failed}`,
		),
		"",
		...(problems.length
			? [
					"Needs attention:",
					...problems.map(
						(j) =>
							`  - ${j.name} on ${j.agentName} [${HEALTH[j.health].label}]${j.lastError ? `: ${truncate(j.lastError, 160)}` : ""}`,
					),
					"",
				]
			: []),
		"Agents:",
		...data.agents
			.filter((a) => a.activeJobs > 0 || a.runs > 0)
			.map(
				(a) =>
					`  - ${a.name}: ${a.active ? (a.online ? "online" : "offline") : "disabled"}, uptime ${formatPct(a.uptimePct)}, ${a.runs} runs, ${a.failed} failed`,
			),
		"",
		"Jobs:",
		...data.jobs.map(
			(j) =>
				`  - ${j.name} (${j.agentName}) [${HEALTH[j.health].label}]: ${j.completed} ok, ${j.failed} failed, last success ${j.lastSuccessAt ? formatAgo(j.lastSuccessAt) : "never"}`,
		),
		"",
		...(appUrl ? [`Open dashboard: ${appUrl}/dashboard`, ""] : []),
		TEXT_FOOTER,
	].join("\n");

	return { subject, html, text };
}
