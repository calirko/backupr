import { createTransport, type Transporter } from "nodemailer";
import { prisma } from "../lib/prisma";
import { LOGO_BASE64, LOGO_CID } from "./templates/logo";
import type { RenderedMail } from "./templates/types";

const db = prisma;

export interface Mail extends RenderedMail {
	to: string;
}

/** Public URL of the web app, used for links in emails. Null when unset. */
export function appUrl(): string | null {
	const url = process.env.APP_URL?.trim();
	return url ? url.replace(/\/+$/, "") : null;
}

const REQUIRED_MAIL_VARS = ["MAIL_HOST", "MAIL_USER", "MAIL_PASS"] as const;

/** Required MAIL_* variables that are unset or blank in the server's environment. */
export function missingMailVars(): string[] {
	return REQUIRED_MAIL_VARS.filter((name) => !process.env[name]?.trim());
}

export function mailEnabled(): boolean {
	return missingMailVars().length === 0;
}

let transport: Transporter | null = null;

function getTransport(): Transporter {
	if (transport) return transport;

	const port = Number(process.env.MAIL_PORT || 587);
	transport = createTransport({
		host: process.env.MAIL_HOST,
		port,
		// Without an explicit MAIL_SECURE, 465 is SMTPS and anything else uses STARTTLS.
		secure: process.env.MAIL_SECURE
			? process.env.MAIL_SECURE === "true"
			: port === 465,
		auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
		// Fail fast on unreachable hosts instead of nodemailer's 2 minute default.
		connectionTimeout: 15_000,
		greetingTimeout: 15_000,
		socketTimeout: 30_000,
	});
	return transport;
}

function logoAttachment() {
	return {
		filename: "backupr.png",
		content: Buffer.from(LOGO_BASE64, "base64"),
		contentType: "image/png",
		cid: LOGO_CID,
		contentDisposition: "inline" as const,
	};
}

/** Sends one email. Throws on SMTP errors; callers decide how to handle them. */
export async function sendMail(mail: Mail): Promise<void> {
	if (!mailEnabled()) {
		throw new Error(
			`Email is not configured: ${missingMailVars().join(", ")} not set.`,
		);
	}

	const fromAddress = process.env.MAIL_FROM || process.env.MAIL_USER;
	const fromName = process.env.MAIL_FROM_NAME || "Backupr";

	await getTransport().sendMail({
		from: `"${fromName}" <${fromAddress}>`,
		to: mail.to,
		subject: mail.subject,
		text: mail.text,
		html: mail.html,
		// Only attach the logo when the layout references it.
		attachments: mail.html.includes(`cid:${LOGO_CID}`)
			? [logoAttachment()]
			: undefined,
	});
}

/** Emails of the users that opted in to notifications. */
export async function getRecipients(): Promise<string[]> {
	const users = await db.user.findMany({
		where: { receive_emails: true, deleted_at: null },
		select: { email: true },
	});
	return users.map((u) => u.email);
}

/**
 * Sends the same message to every opted-in user, one message per recipient so
 * addresses aren't exposed to each other. Never throws: an SMTP failure must not
 * break the scheduler or the agent WebSocket. Returns how many were delivered.
 */
export async function sendToRecipients(mail: RenderedMail): Promise<number> {
	if (!mailEnabled()) return 0;

	let recipients: string[];
	try {
		recipients = await getRecipients();
	} catch (err) {
		console.error("[Mail] Failed to load recipients:", err);
		return 0;
	}

	let sent = 0;
	for (const to of recipients) {
		try {
			await sendMail({ ...mail, to });
			sent++;
		} catch (err) {
			console.error(
				`[Mail] Failed to send "${mail.subject}" to ${to}: ${err instanceof Error ? err.message : err}`,
			);
		}
	}
	return sent;
}

export function logMailConfig(): void {
	if (!mailEnabled()) {
		console.warn(
			`[Mail] ${missingMailVars().join(", ")} not set; email notifications are disabled.`,
		);
		return;
	}
	if (!appUrl()) {
		console.warn("[Mail] APP_URL not set; emails will not include links.");
	}
	console.log(
		`[Mail] Email notifications enabled via ${process.env.MAIL_HOST}:${process.env.MAIL_PORT || 587} as ${process.env.MAIL_USER}`,
	);
}
