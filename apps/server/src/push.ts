import webpush, { WebPushError } from "web-push";
import { prisma } from "./lib/prisma";
import { pushNotification } from "./ws.web";

const db = prisma;

export interface UserNotification {
	title: string;
	body: string;
	level: "success" | "error" | "warning" | "info";
	/** App path opened when the notification is clicked. */
	url?: string;
	/** Notifications with the same tag replace each other. */
	tag?: string;
}

const REQUIRED_PUSH_VARS = [
	"VAPID_PUBLIC_KEY",
	"VAPID_PRIVATE_KEY",
	"VAPID_SUBJECT",
] as const;

/** Required VAPID_* variables that are unset or blank in the server's environment. */
export function missingPushVars(): string[] {
	return REQUIRED_PUSH_VARS.filter((name) => !process.env[name]?.trim());
}

export function pushEnabled(): boolean {
	return missingPushVars().length === 0;
}

export function vapidPublicKey(): string | null {
	return pushEnabled() ? process.env.VAPID_PUBLIC_KEY!.trim() : null;
}

export function logPushConfig(): void {
	if (pushEnabled()) {
		console.log("[Push] Web Push enabled");
	} else {
		console.log(
			`[Push] Web Push disabled: ${missingPushVars().join(", ")} not set`,
		);
	}
}

let configured = false;

function configure(): void {
	if (configured) return;
	webpush.setVapidDetails(
		process.env.VAPID_SUBJECT!.trim(),
		process.env.VAPID_PUBLIC_KEY!.trim(),
		process.env.VAPID_PRIVATE_KEY!.trim(),
	);
	configured = true;
}

/**
 * Sends a Web Push message to every subscribed browser of the given users.
 * Returns how many browsers accepted it. Never throws.
 */
export async function sendPush(
	userIds: string[],
	notification: UserNotification,
): Promise<number> {
	if (userIds.length === 0 || !pushEnabled()) return 0;

	try {
		configure();
		const subscriptions = await db.pushSubscription.findMany({
			where: { user_id: { in: userIds }, user: { deleted_at: null } },
		});
		const payload = JSON.stringify(notification);

		const results = await Promise.all(
			subscriptions.map(async (sub) => {
				try {
					await webpush.sendNotification(
						{
							endpoint: sub.endpoint,
							keys: { p256dh: sub.p256dh, auth: sub.auth },
						},
						payload,
						{ TTL: 24 * 60 * 60 },
					);
					return sub.id;
				} catch (err) {
					// The browser dropped the subscription: forget it.
					if (
						err instanceof WebPushError &&
						(err.statusCode === 404 || err.statusCode === 410)
					) {
						await db.pushSubscription.deleteMany({ where: { id: sub.id } });
					} else {
						console.error(`[Push] Delivery to ${sub.id} failed:`, err);
					}
					return null;
				}
			}),
		);

		const delivered = results.filter((id): id is string => id !== null);
		if (delivered.length) {
			await db.pushSubscription.updateMany({
				where: { id: { in: delivered } },
				data: { last_used_at: new Date() },
			});
		}
		return delivered.length;
	} catch (err) {
		console.error("[Push] Failed to send push notifications:", err);
		return 0;
	}
}

/**
 * Notifies users in the app (a toast over the web socket) and on their
 * desktop (Web Push). The service worker skips the desktop notification while
 * the app is visible, so the two never double up. Returns the number of
 * browsers the push reached.
 */
export async function notifyUsers(
	userIds: string[],
	notification: UserNotification,
): Promise<number> {
	const unique = [...new Set(userIds)];
	if (unique.length === 0) return 0;
	pushNotification(unique, notification);
	return sendPush(unique, notification);
}

/** Users who opted into push alerts (failed backups, stale jobs). */
export async function pushAlertRecipients(): Promise<string[]> {
	const users = await db.user.findMany({
		where: { receive_push_alerts: true, deleted_at: null },
		select: { id: true },
	});
	return users.map((u) => u.id);
}
