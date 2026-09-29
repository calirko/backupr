import { LOGO_CID } from "./logo";

/**
 * Email clients have poor support for modern CSS, so everything here is
 * table-based with inline styles. Colors mirror apps/web/src/main.css.
 */
export const COLORS = {
	background: "#050506",
	card: "#1c1c1d",
	inset: "#111112",
	border: "#2a2a2c",
	foreground: "#f3f4fc",
	muted: "#a3a3a6",
	primary: "#f3f4fc",
	primaryForeground: "#1c1c1d",
	destructive: "#c9a9a6",
	yellowish: "#c9bfa0",
	greenish: "#a9c4ab",
	blueish: "#a8b1d4",
} as const;

const FONT =
	"'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const HEADING_FONT = `'Archivo Black', 'Arial Black', ${FONT}`;
const MONO =
	"ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function truncate(value: string, max = 300): string {
	return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

const TZ = process.env.TZ ?? "UTC";

export function formatDate(date: Date): string {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone: TZ,
		dateStyle: "medium",
		timeStyle: "short",
	}).format(date);
}

export function formatAgo(date: Date, now = new Date()): string {
	const minutes = Math.max(
		0,
		Math.round((now.getTime() - date.getTime()) / 60_000),
	);
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
	const days = Math.round(hours / 24);
	return `${days} days ago`;
}

export function heading(text: string): string {
	return `<h1 style="margin:0 0 16px 0;font-family:${HEADING_FONT};font-size:22px;line-height:28px;font-weight:400;color:${COLORS.foreground};">${escapeHtml(text)}</h1>`;
}

export function subheading(html: string): string {
	return `<h2 style="margin:28px 0 10px 0;font-family:${HEADING_FONT};font-size:15px;line-height:20px;font-weight:400;color:${COLORS.foreground};">${html}</h2>`;
}

export function paragraph(html: string): string {
	return `<p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:${COLORS.foreground};">${html}</p>`;
}

export function muted(html: string): string {
	return `<p style="margin:16px 0 0 0;font-size:13px;line-height:20px;color:${COLORS.muted};">${html}</p>`;
}

/** Blends `color` over `base` (both #rrggbb). Email clients handle rgba() unevenly. */
function mix(color: string, base: string, amount: number): string {
	const channel = (hex: string, i: number) =>
		Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
	return `#${[0, 1, 2]
		.map((i) =>
			Math.round(
				channel(base, i) + (channel(color, i) - channel(base, i)) * amount,
			)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
}

/** Same text style as the app's Badge (xs, medium, status color) on a soft tint. */
export function badge(text: string, color: string): string {
	return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background-color:${mix(color, COLORS.card, 0.16)};font-family:${FONT};font-size:12px;line-height:16px;font-weight:500;color:${color};white-space:nowrap;">${escapeHtml(text)}</span>`;
}

export function button(label: string, url: string): string {
	return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px 0;">
  <tr><td bgcolor="${COLORS.primary}" style="border-radius:4px;">
    <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:11px 24px;font-family:${FONT};font-size:14px;font-weight:600;color:${COLORS.primaryForeground};text-decoration:none;border-radius:4px;">${escapeHtml(label)}</a>
  </td></tr>
</table>`;
}

export function codeBlock(text: string): string {
	return `<div style="margin:0;padding:12px 14px;background-color:${COLORS.inset};border:1px solid ${COLORS.border};border-radius:4px;font-family:${MONO};font-size:12px;line-height:18px;color:${COLORS.destructive};white-space:pre-wrap;word-break:break-word;">${escapeHtml(text)}</div>`;
}

/** Two-column key/value list. Values are raw HTML (escape before passing). */
export function detailsTable(
	rows: [label: string, valueHtml: string][],
): string {
	const body = rows
		.map(
			([label, value]) => `<tr>
  <td valign="top" width="120" style="width:120px;padding:8px 16px 8px 0;border-bottom:1px solid ${COLORS.border};font-size:13px;color:${COLORS.muted};white-space:nowrap;">${escapeHtml(label)}</td>
  <td valign="top" style="padding:8px 0;border-bottom:1px solid ${COLORS.border};font-size:14px;color:${COLORS.foreground};">${value}</td>
</tr>`,
		)
		.join("\n");
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;border-top:1px solid ${COLORS.border};">${body}</table>`;
}

export interface JobRow {
	name: string;
	/** Main line under the job name, raw HTML. */
	detailHtml: string;
	/** Optional error shown in monospace under the row. */
	error?: string | null;
}

/** Stacked list of jobs; each row is a bordered block (renders well on mobile). */
export function jobList(jobs: JobRow[]): string {
	return jobs
		.map(
			(
				job,
			) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px 0;background-color:${COLORS.inset};border:1px solid ${COLORS.border};border-radius:4px;">
  <tr><td style="padding:12px 14px;">
    <div style="font-size:14px;line-height:20px;font-weight:600;color:${COLORS.foreground};">${escapeHtml(job.name)}</div>
    <div style="font-size:13px;line-height:20px;color:${COLORS.muted};">${job.detailHtml}</div>
    ${job.error ? `<div style="margin-top:8px;font-family:${MONO};font-size:12px;line-height:18px;color:${COLORS.destructive};white-space:pre-wrap;word-break:break-word;">${escapeHtml(truncate(job.error))}</div>` : ""}
  </td></tr>
</table>`,
		)
		.join("\n");
}

interface LayoutOptions {
	title: string;
	body: string;
	preheader?: string;
}

export function renderLayout({
	title,
	body,
	preheader,
}: LayoutOptions): string {
	const c = COLORS;
	const year = new Date().getFullYear();
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
<title>${escapeHtml(title)}</title>
<style>
  @media only screen and (max-width: 520px) {
    .outer { padding: 16px 8px !important; }
    .card { padding: 20px 14px !important; }
    .hide-sm { display: none !important; }
    .cell-sm { padding-left: 4px !important; padding-right: 4px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${c.background};font-family:${FONT};color:${c.foreground};">
${preheader ? `<div style="display:none;font-size:1px;color:${c.background};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.background}" class="outer" style="background-color:${c.background};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
      <!-- Brand -->
      <tr><td align="left" style="padding:0 4px 20px 4px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle" style="padding-right:10px;">
            <img src="cid:${LOGO_CID}" width="32" height="32" alt="Backupr" style="display:block;width:32px;height:32px;border:0;border-radius:4px;" />
          </td>
          <td valign="middle">
            <span style="font-family:${HEADING_FONT};font-size:22px;line-height:32px;color:${c.foreground};">Backupr</span>
          </td>
        </tr></table>
      </td></tr>
      <!-- Card -->
      <tr><td bgcolor="${c.card}" class="card" style="background-color:${c.card};border:1px solid ${c.border};border-radius:4px;padding:32px;">
        ${body}
      </td></tr>
      <!-- Footer -->
      <tr><td align="center" style="padding:24px 4px 0 4px;">
        <p style="margin:0 0 4px 0;font-size:12px;line-height:18px;color:${c.muted};">This is an automated message from Backupr. Please don't reply.</p>
        <p style="margin:0 0 4px 0;font-size:12px;line-height:18px;color:${c.muted};">You can change which emails you receive in Settings → Preferences.</p>
        <p style="margin:0;font-size:12px;line-height:18px;color:${c.muted};">&copy; ${year} Backupr</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export const TEXT_FOOTER =
	"—\nAutomated message from Backupr. Manage emails in Settings → Preferences.";
