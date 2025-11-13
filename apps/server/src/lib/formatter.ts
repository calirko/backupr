export function formatIsoDate(timestamp: Date): string {
	const pad = (n: number) => n.toString().padStart(2, "0");
	const brazilTime = new Date(timestamp.getTime() - 3 * 60 * 60 * 1000);
	const d = brazilTime.getDate();
	const m = brazilTime.getMonth() + 1;
	const y = brazilTime.getFullYear();
	const h = brazilTime.getHours();
	const s = brazilTime.getSeconds();
	const min = brazilTime.getMinutes();
	return `${pad(h)}:${pad(min)}:${pad(s)},${pad(d)}-${pad(m)}-${y}`;
}
