import StatusBadge from "@/components/layout/statusBadge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckCircle, Clock, Server, ServerOff, XCircle } from "lucide-react";

export function formatBytes(bytes: number | bigint | string): string {
	let b: number;
	if (typeof bytes === "string") {
		b = Number(bytes);
	} else if (typeof bytes === "bigint") {
		b = Number(bytes);
	} else {
		b = bytes;
	}
	if (b === 0) return "0 Bytes";
	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(b) / Math.log(k));
	return `${Math.round((b / k ** i) * 100) / 100} ${sizes[i]}`;
}

export function renderStatusBadge(status: string) {
	switch (status) {
		case "completed":
			return (
				<StatusBadge
					label="Completed"
					variant="success"
					icon={<CheckCircle size={16} />}
				/>
			);
		case "in_progress":
			return (
				<StatusBadge
					label="In Progress"
					variant="warning"
					icon={<Clock size={16} />}
				/>
			);
		case "failed":
			return (
				<StatusBadge
					label="Failed"
					variant="destructive"
					icon={<XCircle size={16} />}
				/>
			);
		default:
			return status;
	}
}

export function ConnectionIcon({
	connectionStatus,
}: {
	connectionStatus: string | null;
}) {
	switch (connectionStatus) {
		case "creating":
			return (
				<Tooltip>
					<TooltipTrigger>
						<Server className="h-4 w-4 text-blue-300 text-blink-blue" />
					</TooltipTrigger>
					<TooltipContent>
						<span>This client is creating a backup.</span>
					</TooltipContent>
				</Tooltip>
			);
		case "idle":
			return (
				<Tooltip>
					<TooltipTrigger>
						<Server className="h-4 w-4 text-green-200 text-blink-green" />
					</TooltipTrigger>
					<TooltipContent>
						<span>This client is connected to Backupr services.</span>
					</TooltipContent>
				</Tooltip>
			);
		case "disconnected":
			return (
				<Tooltip>
					<TooltipTrigger>
						<ServerOff className="h-4 w-4 text-muted-foreground" />
					</TooltipTrigger>
					<TooltipContent>
						<span>
							This client is not currently connected to Backupr services. Please
							ensure the Backupr client is running and has an active internet
							connection.
						</span>
					</TooltipContent>
				</Tooltip>
			);
		case "uploading":
			return (
				<Tooltip>
					<TooltipTrigger>
						<Server className="h-4 w-4 text-blue-300 text-blink-blue" />
					</TooltipTrigger>
					<TooltipContent>
						<span>This client is performing an upload.</span>
					</TooltipContent>
				</Tooltip>
			);
		default:
			<Tooltip>
				<TooltipTrigger>
					<Server className="h-4 w-4 text-orange-200" />
				</TooltipTrigger>
				<TooltipContent>
					<span>This client's status is unknown.</span>
				</TooltipContent>
			</Tooltip>;
	}
}

export function ClientTitle({
	name,
	connectionStatus,
}: {
	name: string;
	connectionStatus: string | null;
}) {
	return (
		<div className="flex items-center shrink-0 p-2 border gap-2 bg-background">
			<ConnectionIcon connectionStatus={connectionStatus} />
			<span className="font-semibold">{name}</span>
		</div>
	);
}
