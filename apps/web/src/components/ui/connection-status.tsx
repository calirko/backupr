export type AgentConnectionStatus =
	| "connected"
	| "disconnected"
	| "stale"
	| "running"
	| "queued"
	| "scheduler_queued"
	| "unknown"
	| "none";

const STATUS_LABEL: Record<AgentConnectionStatus, string> = {
	connected: "Connected",
	running: "Running",
	queued: "Queued",
	scheduler_queued: "In Queue",
	stale: "Stale",
	disconnected: "Disconnected",
	unknown: "Unknown",
	none: "No Status",
};

const ACTIVE_STATUSES = new Set<AgentConnectionStatus>([
	"connected",
	"running",
	"queued",
	"scheduler_queued",
	"stale",
]);

interface ConnectionStatusProps {
	status: AgentConnectionStatus;
	type?: "short" | "long";
}

export function ConnectionStatus({
	status,
	type = "long",
}: ConnectionStatusProps) {
	const isActive = ACTIVE_STATUSES.has(status);

	return (
		<span className={`cs-wrap cs-${status}${isActive ? " cs-active" : ""}`}>
			<span className="cs-dot ml-1" />
			{type === "long" && (
				<span className="cs-label text-xs font-sans font-semibold!">
					{STATUS_LABEL[status]}
				</span>
			)}
		</span>
	);
}
