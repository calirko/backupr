import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";

export default function Status({ onStatusChange }) {
	const [status, setStatus] = useState({
		title: "Idle",
		description: "No backup is currently running.",
		type: "idle",
		progress: 0,
	});

	useEffect(() => {
		if (!window.electron) return;

		// Listen for backup status updates from the main process
		const unsubscribe = window.electron.ipcRenderer.on(
			"backup-status",
			(newStatus) => {
				console.log("Received backup status:", newStatus);
				setStatus(newStatus);
				if (onStatusChange) onStatusChange(newStatus);

				if (newStatus.type === "success" || newStatus.type === "error") {
					// Automatically clear status after 5 seconds
					setTimeout(() => {
						setStatus({
							title: "Idle",
							description: "No backup is currently running.",
							type: "idle",
							progress: 0,
						});
					}, 10000);
				}
			},
		);

		return () => {
			if (unsubscribe) unsubscribe();
		};
	}, []);

	function clearStatus() {
		setStatus({
			title: "Idle",
			description: "No backup is currently running.",
			type: "idle",
			progress: 0,
		});
	}

	if (status.type === "idle") return null;

	return (
		<div className="w-full border p-4 flex items-center relative">
			<div
				style={{ zIndex: 1 }}
				className="flex justify-between items-center w-full"
			>
				<div>
					<p className="font-semibold text-xs">{status.title}</p>
					<p className="text-xs text-muted-foreground">{status.description}</p>
				</div>
				<div className="flex items-center gap-1.5">
					{String(status?.progress) && (
						<p className="text-xs text-muted-foreground">{status.progress}%</p>
					)}
					<Button
						variant="ghost"
						onClick={clearStatus}
						className="aspect-square p-1 h-7"
					>
						<X className="h-4" />
					</Button>
				</div>
			</div>
			<div
				className={`h-full absolute top-0 left-0 transition-all duration-300 ease-in-out ${status.type === "error" ? "bg-destructive/50" : status.type === "success" ? "bg-progress-success" : status.progress > 0 ? "bg-progress" : "bg-muted/50"}`}
				style={{ width: `${status.progress || 0}%`, zIndex: 0 }}
			/>
		</div>
	);
}
