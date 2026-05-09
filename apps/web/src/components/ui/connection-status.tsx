export type AgentConnectionStatus =
	| "connected"
	| "disconnected"
	| "stale"
	| "running"
	| "queued"
	| "unknown"
	| "none";

const STATUS_LABEL: Record<AgentConnectionStatus, string> = {
	connected: "Connected",
	running: "Running",
	queued: "Queued",
	stale: "Stale",
	disconnected: "Disconnected",
	unknown: "Unknown",
	none: "No Status",
};

const ACTIVE_STATUSES = new Set<AgentConnectionStatus>([
	"connected",
	"running",
	"queued",
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
				<span className="cs-label text-xs">{STATUS_LABEL[status]}</span>
			)}
		</span>
	);
}
