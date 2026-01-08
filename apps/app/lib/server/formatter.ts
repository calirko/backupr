export function formatIsoDate(timestamp: Date): string {
	const pad = (n: number) => n.toString().padStart(2, "0");
	const brazilTime = new Date(timestamp.getTime() - 3 * 60 * 60 * 1000);
	const d = brazilTime.getUTCDate();
	const m = brazilTime.getUTCMonth() + 1;
	const y = brazilTime.getUTCFullYear();
	const h = brazilTime.getUTCHours();
	const min = brazilTime.getUTCMinutes();
	const s = brazilTime.getUTCSeconds();
	return `${pad(h)}:${pad(min)}:${pad(s)},${pad(d)}-${pad(m)}-${y}`;
}
