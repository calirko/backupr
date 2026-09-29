// Fraction of the [since, until) window the agent spent in a non-OFFLINE status.
// `records` must be sorted by date ascending and may start before `since`
// (a baseline record) to avoid treating the window's start as downtime.
export function computeUptimePct(
	records: { status: string; date: Date }[],
	since: Date,
	until: Date = new Date(),
): number {
	const untilMs = until.getTime();
	const sinceMs = since.getTime();
	const totalMs = untilMs - sinceMs;
	if (totalMs <= 0) return 0;

	let onlineMs = 0;
	for (let i = 0; i < records.length; i++) {
		const r = records[i]!;
		if (r.status === "OFFLINE") continue;

		const start = Math.max(new Date(r.date).getTime(), sinceMs);
		const next = records[i + 1];
		const end = Math.min(
			next ? new Date(next.date).getTime() : untilMs,
			untilMs,
		);
		if (end > start) onlineMs += end - start;
	}

	return (onlineMs / totalMs) * 100;
}
