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

export function ClientTitle({
	name,
	connectionStatus,
}: {
	name: string;
	connectionStatus: boolean;
}) {
	return (
		<div className="flex items-center gap-1.5 shrink-0 p-2 border gap-1 bg-background">
			{connectionStatus ? (
				<Tooltip>
					<TooltipTrigger>
						<Server className="h-4 w-4 text-green-200 text-blink-green" />
					</TooltipTrigger>
					<TooltipContent>
						<span>This client is connected to Backupr services.</span>
					</TooltipContent>
				</Tooltip>
			) : (
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
			)}
			<span className="font-semibold">{name}</span>
		</div>
	);
}
