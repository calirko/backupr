import {
	badge,
	button,
	COLORS,
	escapeHtml,
	heading,
	muted,
	paragraph,
	renderLayout,
	TEXT_FOOTER,
} from "./layout";
import type { RenderedMail } from "./types";

export function renderTestEmail({
	name,
	appUrl,
}: {
	name: string | null;
	appUrl: string | null;
}): RenderedMail {
	const subject = "Backupr test email";
	const greeting = name ? `Hi ${name},` : "Hi,";
	const body = [
		badge("Test", COLORS.blueish),
		`<div style="height:14px;line-height:14px;">&nbsp;</div>`,
		heading("Email is working"),
		paragraph(escapeHtml(greeting)),
		paragraph(
			"Backupr can send you email. You'll be notified when a backup fails and when a job goes several days without a successful backup.",
		),
		appUrl ? button("Open Backupr", appUrl) : "",
		muted(
			'You got this email because someone clicked "Send test email" in Settings.',
		),
	].join("\n");

	return {
		subject,
		html: renderLayout({
			title: subject,
			preheader: "Email notifications are set up.",
			body,
		}),
		text: [
			subject,
			"",
			greeting,
			"Backupr can send you email. You'll be notified when a backup fails and when a job goes several days without a successful backup.",
			"",
			TEXT_FOOTER,
		].join("\n"),
	};
}
