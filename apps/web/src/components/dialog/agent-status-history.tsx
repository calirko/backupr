import { XSquareIcon } from "@phosphor-icons/react";
import { endOfDay, format, startOfDay, subDays } from "date-fns";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "../ui/drawer";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "../ui/tooltip";

interface StatusRecord {
	id: string;
	status: "ONLINE" | "OFFLINE" | "RUNNING_BACKUP" | "FAILED_BACKUP";
	date: string;
}

interface StatusHistoryData {
	agent: { id: string; name: string };
	records: StatusRecord[];
}

// ─── Color helpers ─────────────────────────────────────────────────────────

const STATUS_COLORS: Record<StatusRecord["status"], string> = {
	ONLINE: "var(--greenish)",
	RUNNING_BACKUP: "var(--blueish)",
	OFFLINE: "var(--muted)",
	FAILED_BACKUP: "var(--destructive)",
};

const STATUS_LABELS: Record<StatusRecord["status"], string> = {
	ONLINE: "Online",
	RUNNING_BACKUP: "Running backup",
	OFFLINE: "Offline",
	FAILED_BACKUP: "Failed backup",
};

// ─── Timeline builder ──────────────────────────────────────────────────────

interface Segment {
	status: StatusRecord["status"];
	startFrac: number;
	widthFrac: number;
	startMs: number;
	endMs: number;
	stillActive: boolean;
}

function buildDaySegments(records: StatusRecord[], day: Date): Segment[] {
	const dayStart = startOfDay(day).getTime();
	const dayEnd = endOfDay(day).getTime();
	const dayMs = dayEnd - dayStart;
	const segments: Segment[] = [];

	// Group consecutive records with the same status
	let i = 0;
	while (i < records.length) {
		const current = records[i];
		const currentStatus = current.status;
		const recStart = new Date(current.date).getTime();

		// Find the next record with a different status
		let j = i + 1;
		while (j < records.length && records[j].status === currentStatus) {
			j++;
		}

		// End time is either the next different status or now
		const recEnd =
			j < records.length ? new Date(records[j].date).getTime() : Date.now();

		const clampedStart = Math.max(recStart, dayStart);
		const clampedEnd = Math.min(recEnd, dayEnd);
		if (clampedEnd <= clampedStart) {
			i = j;
			continue;
		}

		segments.push({
			status: currentStatus,
			startFrac: (clampedStart - dayStart) / dayMs,
			widthFrac: (clampedEnd - clampedStart) / dayMs,
			startMs: clampedStart,
			endMs: clampedEnd,
			stillActive: j >= records.length,
		});

		i = j;
	}

	return segments;
}

function computeUptimeFraction(records: StatusRecord[], days: Date[]): number {
	let onlineMs = 0;
	let totalMs = 0;

	for (const day of days) {
		const dayStart = startOfDay(day).getTime();
		const dayEnd = Math.min(endOfDay(day).getTime(), Date.now());
		totalMs += dayEnd - dayStart;

		for (let i = 0; i < records.length; i++) {
			const r = records[i];
			if (r.status === "OFFLINE") continue;

			const recStart = new Date(r.date).getTime();
			const next = records[i + 1];
			const recEnd = next ? new Date(next.date).getTime() : Date.now();

			const clampedStart = Math.max(recStart, dayStart);
			const clampedEnd = Math.min(recEnd, dayEnd);
			if (clampedEnd > clampedStart) onlineMs += clampedEnd - clampedStart;
		}
	}

	return totalMs > 0 ? onlineMs / totalMs : 0;
}

function formatDuration(ms: number): string {
	const h = Math.floor(ms / 3_600_000);
	const m = Math.floor((ms % 3_600_000) / 60_000);
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m`;
}

// ─── Sub-components ────────────────────────────────────────────────────────

// Returns inline style overrides that zero-out border-radius on edges that
// touch an adjacent segment, letting dynround handle the exposed outer corners.
function segmentEdgeRadius(segs: Segment[], i: number) {
	const touchLeft =
		i > 0 &&
		Math.abs(
			segs[i].startFrac - (segs[i - 1].startFrac + segs[i - 1].widthFrac),
		) < 0.0001;
	const touchRight =
		i < segs.length - 1 &&
		Math.abs(segs[i].startFrac + segs[i].widthFrac - segs[i + 1].startFrac) <
			0.0001;
	return {
		borderTopLeftRadius: touchLeft ? 0 : undefined,
		borderBottomLeftRadius: touchLeft ? 0 : undefined,
		borderTopRightRadius: touchRight ? 0 : undefined,
		borderBottomRightRadius: touchRight ? 0 : undefined,
	};
}

function DayRow({ day, records }: { day: Date; records: StatusRecord[] }) {
	// Base layer: RUNNING_BACKUP and FAILED_BACKUP collapse to ONLINE so the
	// green strip shows the full "agent was alive" window underneath.
	const baseRecords = records.map((r) => ({
		...r,
		status:
			r.status === "RUNNING_BACKUP" || r.status === "FAILED_BACKUP"
				? ("ONLINE" as const)
				: r.status,
	}));
	const baseSegments = buildDaySegments(baseRecords, day);

	// Overlay layer: only the elevated statuses, drawn as a thinner pill on top.
	const allSegments = buildDaySegments(records, day);
	const overlaySegments = allSegments.filter(
		(s) => s.status === "RUNNING_BACKUP" || s.status === "FAILED_BACKUP",
	);

	const isToday =
		startOfDay(day).getTime() === startOfDay(new Date()).getTime();

	const nowFrac = isToday
		? (Date.now() - startOfDay(day).getTime()) /
			(endOfDay(day).getTime() - startOfDay(day).getTime())
		: null;

	return (
		<div className="flex items-center gap-3 text-xs">
			<span className="text-muted-foreground w-20 shrink-0 text-right">
				{isToday ? "Today" : format(day, "EEE, MMM d")}
			</span>
			<div
				className="relative h-8 flex-1 border dynround overflow-hidden"
				style={{ backgroundColor: "oklch(0.13 0 0)" }}
			>
				{/* Base layer - full height */}
				{baseSegments.map((seg, i) => {
					const startLabel = format(new Date(seg.startMs), "HH:mm");
					const endLabel = seg.stillActive
						? "now"
						: format(new Date(seg.endMs), "HH:mm");
					return (
						<Tooltip key={i}>
							<TooltipTrigger asChild>
								<div
									className="absolute top-0 h-full cursor-default dynround"
									style={{
										left: `${seg.startFrac * 100}%`,
										width: `${seg.widthFrac * 100}%`,
										backgroundColor: STATUS_COLORS[seg.status],
										opacity: seg.status === "OFFLINE" ? 0.5 : 1,
										...segmentEdgeRadius(baseSegments, i),
									}}
								/>
							</TooltipTrigger>
							<TooltipContent>
								<div className="space-y-0.5">
									<p className="font-semibold">{STATUS_LABELS[seg.status]}</p>
									<p>
										{startLabel} → {endLabel}
									</p>
									<p className="opacity-70">
										{formatDuration(seg.endMs - seg.startMs)}
									</p>
								</div>
							</TooltipContent>
						</Tooltip>
					);
				})}

				{/* Overlay layer - shorter pill so the green base peeks through */}
				{overlaySegments.map((seg, i) => {
					const startLabel = format(new Date(seg.startMs), "HH:mm");
					const endLabel = seg.stillActive
						? "now"
						: format(new Date(seg.endMs), "HH:mm");
					return (
						<Tooltip key={`ov-${i}`}>
							<TooltipTrigger asChild>
								<div
									className="absolute cursor-default dynround"
									style={{
										left: `${seg.startFrac * 100}%`,
										width: `${seg.widthFrac * 100}%`,
										minWidth: "20px",
										top: "23%",
										height: "55%",
										backgroundColor: STATUS_COLORS[seg.status],
										...segmentEdgeRadius(overlaySegments, i),
									}}
								/>
							</TooltipTrigger>
							<TooltipContent>
								<div className="space-y-0.5">
									<p className="font-semibold">{STATUS_LABELS[seg.status]}</p>
									<p>
										{startLabel} → {endLabel}
									</p>
									<p className="opacity-70">
										{formatDuration(seg.endMs - seg.startMs)}
									</p>
								</div>
							</TooltipContent>
						</Tooltip>
					);
				})}

				{/* Current-time marker */}
				{nowFrac !== null && (
					<div
						className="absolute top-0 h-full pointer-events-none flex flex-col items-center"
						style={{
							left: `${nowFrac * 100}%`,
							transform: "translateX(-50%)",
						}}
					>
						<span
							className="text-white/80 leading-none select-none"
							style={{ fontSize: "9px", marginTop: "3px", marginBottom: "5px" }}
						>
							now
						</span>
						<div
							className="flex-1 w-[2px]"
							style={{ backgroundColor: "white", opacity: 0.8 }}
						/>
					</div>
				)}
			</div>
		</div>
	);
}

function StatPill({
	color,
	label,
	value,
}: {
	color: string;
	label: string;
	value: string;
}) {
	return (
		<div className="flex items-center gap-2 text-sm">
			<span
				className="inline-block w-2.5 h-2.5 shrink-0"
				style={{ backgroundColor: color, borderRadius: "3px" }}
			/>
			<span className="text-muted-foreground">{label}</span>
			<span className="font-medium ml-auto">{value}</span>
		</div>
	);
}

// ─── Main dialog content ───────────────────────────────────────────────────

function Content({
	loading,
	data,
}: {
	loading: boolean;
	data: StatusHistoryData | null;
}) {
	if (loading) {
		return <p className="text-muted-foreground text-sm">Loading…</p>;
	}
	if (!data) return null;

	const days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), i));

	// Aggregate stats over the full 7-day window
	const uptimeFrac = computeUptimeFraction(data.records, days);

	let backupMs = 0;
	for (let i = 0; i < data.records.length; i++) {
		const r = data.records[i];
		if (r.status !== "RUNNING_BACKUP") continue;
		const start = new Date(r.date).getTime();
		const next = data.records[i + 1];
		const end = next ? new Date(next.date).getTime() : Date.now();
		backupMs += end - start;
	}

	return (
		<div className="space-y-6">
			{/* Timeline */}
			<div className="space-y-2">
				<p className="text-xs text-muted-foreground font-medium">Last 7 days</p>
				<TooltipProvider>
					<div className="space-y-3">
						{days.map((day) => (
							<DayRow
								key={day.toISOString()}
								day={day}
								records={data.records}
							/>
						))}
					</div>
				</TooltipProvider>
				{/* Hour markers */}
				<div className="flex ml-[92px] text-[10px] text-muted-foreground justify-between px-0">
					{["0h", "6h", "12h", "18h", "24h"].map((h) => (
						<span key={h}>{h}</span>
					))}
				</div>
			</div>

			{/* Legend */}
			<div className="flex flex-wrap gap-4">
				{(Object.keys(STATUS_COLORS) as StatusRecord["status"][]).map((s) => (
					<div key={s} className="flex items-center gap-1.5 text-xs">
						<span
							className="inline-block w-2.5 h-2.5"
							style={{ backgroundColor: STATUS_COLORS[s], borderRadius: "3px" }}
						/>
						<span className="text-muted-foreground">{STATUS_LABELS[s]}</span>
					</div>
				))}
				<div className="flex items-center gap-1.5 text-xs">
					<span
						className="inline-block w-2.5 h-2.5"
						style={{ backgroundColor: "oklch(0.13 0 0)", borderRadius: "3px" }}
					/>
					<span className="text-muted-foreground">No data</span>
				</div>
			</div>

			{/* Stats */}
			<div className="border dynround p-4 space-y-2">
				<p className="text-xs text-muted-foreground font-medium mb-3">
					Summary
				</p>
				<StatPill
					color="var(--greenish)"
					label="Uptime (7d)"
					value={`${(uptimeFrac * 100).toFixed(1)}%`}
				/>
				<StatPill
					color="var(--blueish)"
					label="Time running backups"
					value={backupMs > 0 ? formatDuration(backupMs) : "-"}
				/>
				<StatPill
					color="var(--muted-foreground)"
					label="Records tracked"
					value={data.records.length.toString()}
				/>
			</div>
		</div>
	);
}

// ─── Dialog ────────────────────────────────────────────────────────────────

export default function AgentStatusHistoryDialog({
	open,
	onClose,
	agentId,
	agentName,
}: {
	open: boolean;
	agentId: string;
	agentName?: string;
	onClose: (result?: boolean) => void;
}): React.JSX.Element {
	const isMobile = useIsMobile();
	const [data, setData] = useState<StatusHistoryData | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (open && agentId) fetchHistory();
	}, [open, agentId]);

	async function fetchHistory() {
		setLoading(true);
		try {
			const res = await fetch(`/api/agents/${agentId}/status`, {
				headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
			});
			if (res.ok) {
				setData(await res.json());
			} else {
				const err = await res.json();
				toast.error("Failed to load status history", {
					description: err.error,
				});
			}
		} catch (e) {
			toast.error("Failed to load status history", {
				description: e instanceof Error ? e.message : String(e),
			});
		} finally {
			setLoading(false);
		}
	}

	const title = agentName ? `Status History` : "Status History";
	const description = "Connection and uptime history for the last 7 days";

	const footer = (
		<Button variant="outline" onClick={() => onClose()}>
			<XSquareIcon />
			Close
		</Button>
	);

	if (isMobile) {
		return (
			<Drawer open={open} onOpenChange={onClose}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>{title}</DrawerTitle>
						<DrawerDescription>{description}</DrawerDescription>
					</DrawerHeader>
					<div className="px-4 pb-4 max-h-[70vh] overflow-y-auto">
						<Content loading={loading} data={data} />
					</div>
					<DrawerFooter>
						<DrawerClose asChild>{footer}</DrawerClose>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-[90vw] max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<Content loading={loading} data={data} />
				<DialogFooter>
					<DialogClose asChild>{footer}</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
