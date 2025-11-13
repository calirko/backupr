export function formatIsoDate(timestamp: Date): string {
	const pad = (n: number) => n.toString().padStart(2, "0");
	const d = timestamp.getDate();
	const m = timestamp.getMonth() + 1;
	const y = timestamp.getFullYear();
	const h = timestamp.getHours();
	const s = timestamp.getSeconds();
	const min = timestamp.getMinutes();
	return `${pad(h)}:${pad(min)}:${pad(s)},${pad(d)}-${pad(m)}-${y}`;
}
