import type { Hono } from "hono";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { rateLimit } from "../lib/rate-limit";
import { appUrl, mailEnabled, sendMail } from "../mail/mail";
import { renderTestEmail } from "../mail/templates/test";
import { sendWeeklyReportNow } from "../weekly-report";

const db = prisma;

export default async function notificationRoutes(app: Hono) {
	// Whether the server can send email, and the current user's preference
	app.get("/api/notifications/status", rateLimit, auth, async (c) => {
		const { id } = c.get("user");
		const user = await db.user.findUnique({
			where: { id },
			select: { receive_emails: true, receive_weekly_report: true },
		});
		return c.json({
			enabled: mailEnabled(),
			receive_emails: user?.receive_emails ?? false,
			receive_weekly_report: user?.receive_weekly_report ?? false,
		});
	});

	// Send a test email to the current user
	app.post("/api/notifications/test", rateLimit, auth, async (c) => {
		if (!mailEnabled()) {
			return c.json(
				{
					error:
						"Email is not configured on the server (MAIL_HOST/MAIL_USER/MAIL_PASS)",
				},
				503,
			);
		}

		const { id } = c.get("user");
		const user = await db.user.findUnique({
			where: { id },
			select: { email: true, name: true },
		});
		if (!user) return c.json({ error: "User not found" }, 404);

		try {
			await sendMail({
				to: user.email,
				...renderTestEmail({ name: user.name, appUrl: appUrl() }),
			});
		} catch (err) {
			console.error(`[Mail] Test email to ${user.email} failed:`, err);
			return c.json(
				{
					error: `Could not send email: ${err instanceof Error ? err.message : String(err)}`,
				},
				502,
			);
		}

		return c.json({ message: `Test email sent to ${user.email}` });
	});

	// Send the weekly report for the last 7 days to the current user, now
	app.post("/api/notifications/weekly-report", rateLimit, auth, async (c) => {
		if (!mailEnabled()) {
			return c.json(
				{
					error:
						"Email is not configured on the server (MAIL_HOST/MAIL_USER/MAIL_PASS)",
				},
				503,
			);
		}

		const { id } = c.get("user");
		const user = await db.user.findUnique({
			where: { id },
			select: { email: true },
		});
		if (!user) return c.json({ error: "User not found" }, 404);

		try {
			await sendWeeklyReportNow(user.email);
		} catch (err) {
			console.error(
				`[WeeklyReport] Manual report to ${user.email} failed:`,
				err,
			);
			return c.json(
				{
					error: `Could not send report: ${err instanceof Error ? err.message : String(err)}`,
				},
				502,
			);
		}

		return c.json({ message: `Weekly report sent to ${user.email}` });
	});
}
