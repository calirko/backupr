export type PushState =
	| "unsupported"
	| "denied"
	| "subscribed"
	| "unsubscribed";

export function isPushSupported(): boolean {
	return (
		"serviceWorker" in navigator &&
		"PushManager" in window &&
		"Notification" in window
	);
}

async function currentSubscription(): Promise<PushSubscription | null> {
	// Not `ready`: it never settles when no worker is registered.
	const registration = await navigator.serviceWorker.getRegistration();
	return registration ? registration.pushManager.getSubscription() : null;
}

/** Whether this browser is subscribed to push notifications. */
export async function getPushState(): Promise<PushState> {
	if (!isPushSupported()) return "unsupported";
	if (Notification.permission === "denied") return "denied";
	return (await currentSubscription()) ? "subscribed" : "unsubscribed";
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
	const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
		.replace(/-/g, "+")
		.replace(/_/g, "/");
	const raw = atob(padded);
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	return bytes;
}

/**
 * Asks for notification permission, subscribes this browser and registers the
 * subscription with the server. Throws with a readable message on failure.
 */
export async function subscribePush(publicKey: string): Promise<void> {
	const permission = await Notification.requestPermission();
	if (permission !== "granted") {
		throw new Error(
			permission === "denied"
				? "Notifications are blocked for this site in your browser settings"
				: "Notification permission was not granted",
		);
	}

	const registration = await navigator.serviceWorker.ready;
	const key = urlBase64ToUint8Array(publicKey);

	// A subscription made with a different server key can't be reused.
	let subscription = await registration.pushManager.getSubscription();
	if (subscription) {
		const existingKey = subscription.options.applicationServerKey;
		const sameKey =
			existingKey && new Uint8Array(existingKey).toString() === key.toString();
		if (!sameKey) {
			await subscription.unsubscribe();
			subscription = null;
		}
	}
	subscription ??= await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: key,
	});

	const res = await fetch("/api/notifications/push/subscribe", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${localStorage.getItem("token")}`,
		},
		body: JSON.stringify(subscription.toJSON()),
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		await subscription.unsubscribe();
		throw new Error(err.error ?? "Failed to register this browser");
	}
}

/** Removes this browser's subscription, on the server and in the browser. */
export async function unsubscribePush(): Promise<void> {
	if (!isPushSupported()) return;
	const subscription = await currentSubscription();
	if (!subscription) return;

	try {
		await fetch("/api/notifications/push/unsubscribe", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${localStorage.getItem("token")}`,
			},
			body: JSON.stringify({ endpoint: subscription.endpoint }),
		});
	} finally {
		await subscription.unsubscribe();
	}
}
