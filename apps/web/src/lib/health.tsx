// Shared formatting for the health columns on the list pages.

import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

/** Wraps an inline value in the UI tooltip; renders it bare without content. */
export function Hint({
	content,
	children,
}: {
	content: React.ReactNode;
	children: React.ReactElement;
}) {
	if (!content) return children;
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent>{content}</TooltipContent>
		</Tooltip>
	);
}

export function formatRelative(date: string | Date | null | undefined): string {
	if (!date) return "Never";
	const diff = Date.now() - new Date(date).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "Just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

export function formatBytes(bytes: number | string | null | undefined): string {
	const n = Number(bytes);
	if (!n || !Number.isFinite(n)) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = n;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** Same thresholds as agent uptime: <90 red, <99 yellow, otherwise green. */
export function rateStyle(pct: number): React.CSSProperties {
	if (pct < 90) return { color: "var(--destructive)" };
	if (pct < 99) return { color: "var(--yellowish)" };
	return { color: "var(--greenish)" };
}

/** A percentage with its raw counts, e.g. "86% (6/7)". */
export function Rate({
	pct,
	num,
	den,
}: {
	pct: number | null | undefined;
	num: number;
	den: number;
}) {
	if (pct == null) return <span className="text-muted-foreground">-</span>;
	return (
		<span style={rateStyle(pct)}>
			{pct.toFixed(0)}%{" "}
			<span className="text-muted-foreground text-xs">
				({num}/{den})
			</span>
		</span>
	);
}

/** Relative time, red when the thing it measures is overdue. */
export function LastSeen({
	at,
	overdue,
	label,
}: {
	at: string | Date | null | undefined;
	overdue?: boolean;
	/** Prefixes the tooltip, e.g. "Last successful backup". */
	label?: string;
}) {
	const date = at ? new Date(at).toLocaleString() : null;
	const content = label ? `${label}: ${date ?? "never"}` : date;
	return (
		<Hint content={content}>
			<span className={overdue ? "text-destructive" : undefined}>
				{formatRelative(at)}
			</span>
		</Hint>
	);
}

export function Count({ value, label }: { value: number; label?: string }) {
	if (!value) return <span className="text-muted-foreground">0</span>;
	return (
		<span className="text-destructive">
			{value}
			{label ? ` ${label}` : ""}
		</span>
	);
}

export function AgentVersion({
	version,
	updateAvailable,
}: {
	version: string | null | undefined;
	updateAvailable?: boolean;
}) {
	if (!version) return <span className="text-muted-foreground">-</span>;
	return (
		<Hint
			content={updateAvailable ? "A newer agent version is available" : null}
		>
			<span
				className="font-mono"
				style={updateAvailable ? { color: "var(--yellowish)" } : undefined}
			>
				v{version}
				{updateAvailable && " ↑"}
			</span>
		</Hint>
	);
}
