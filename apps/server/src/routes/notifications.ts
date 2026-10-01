import type { Hono } from "hono";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { rateLimit } from "../lib/rate-limit";
import { field, HttpError, readJson } from "../lib/validate";
import { appUrl, mailEnabled, missingMailVars, sendMail } from "../mail/mail";
import { renderTestEmail } from "../mail/templates/test";
import {
	missingPushVars,
	notifyUsers,
	pushEnabled,
	vapidPublicKey,
} from "../push";
import { sendWeeklyReportNow } from "../weekly-report";

const db = prisma;

export default async function notificationRoutes(app: Hono) {
	// Whether the server can send email, and the current user's preference
	app.get("/api/notifications/status", rateLimit, auth, async (c) => {
		const { id } = c.get("user");
		const user = await db.user.findUnique({
			where: { id },
			select: {
				receive_emails: true,
				receive_weekly_report: true,
				receive_push_alerts: true,
			},
		});
		return c.json({
			enabled: mailEnabled(),
			missing: missingMailVars(),
			receive_emails: user?.receive_emails ?? false,
			receive_weekly_report: user?.receive_weekly_report ?? false,
			receive_push_alerts: user?.receive_push_alerts ?? false,
			push: {
				enabled: pushEnabled(),
				missing: missingPushVars(),
				public_key: vapidPublicKey(),
			},
		});
	});

	// Send a test email to the current user
	app.post("/api/notifications/test", rateLimit, auth, async (c) => {
		if (!mailEnabled()) {
			return c.json(
				{
					error: `Email is not configured on the server: ${missingMailVars().join(", ")} not set`,
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
					error: `Email is not configured on the server: ${missingMailVars().join(", ")} not set`,
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

	// Register this browser's push subscription for the current user
	app.post("/api/notifications/push/subscribe", rateLimit, auth, async (c) => {
		if (!pushEnabled()) {
			return c.json(
				{
					error: `Push notifications are not configured on the server: ${missingPushVars().join(", ")} not set`,
				},
				503,
			);
		}

		const { id } = c.get("user");
		const json = await readJson(c);
		const endpoint = field.string(json, "endpoint", {
			required: true,
			max: 2048,
		})!;
		if (!endpoint.startsWith("https://")) {
			throw new HttpError(400, '"endpoint" must be an https URL');
		}
		const keys = json.keys;
		if (typeof keys !== "object" || keys === null || Array.isArray(keys)) {
			throw new HttpError(400, '"keys" is required');
		}
		const p256dh = field.string(keys as Record<string, unknown>, "p256dh", {
			required: true,
		})!;
		const authKey = field.string(keys as Record<string, unknown>, "auth", {
			required: true,
		})!;
		const userAgent = c.req.header("User-Agent")?.slice(0, 512) ?? null;

		// Keyed by endpoint: the same browser signing in as someone else takes
		// the subscription over.
		await db.pushSubscription.upsert({
			where: { endpoint },
			create: {
				user_id: id,
				endpoint,
				p256dh,
				auth: authKey,
				user_agent: userAgent,
			},
			update: { user_id: id, p256dh, auth: authKey, user_agent: userAgent },
		});

		return c.json({ message: "Subscribed" }, 201);
	});

	// Remove this browser's push subscription
	app.post(
		"/api/notifications/push/unsubscribe",
		rateLimit,
		auth,
		async (c) => {
			const { id } = c.get("user");
			const json = await readJson(c);
			const endpoint = field.string(json, "endpoint", {
				required: true,
				max: 2048,
			})!;
			await db.pushSubscription.deleteMany({
				where: { endpoint, user_id: id },
			});
			return c.json({ message: "Unsubscribed" });
		},
	);

	// Send a test notification to the current user's browsers
	app.post("/api/notifications/push/test", rateLimit, auth, async (c) => {
		if (!pushEnabled()) {
			return c.json(
				{
					error: `Push notifications are not configured on the server: ${missingPushVars().join(", ")} not set`,
				},
				503,
			);
		}

		const { id } = c.get("user");
		const delivered = await notifyUsers([id], {
			title: "Test notification",
			body: "Desktop notifications from Backupr are working.",
			level: "info",
			tag: "test",
		});
		if (delivered === 0) {
			return c.json(
				{
					error:
						"No browser received it. Enable notifications on this browser first.",
				},
				404,
			);
		}

		return c.json({
			message: `Sent to ${delivered} browser${delivered === 1 ? "" : "s"}`,
		});
	});
}
