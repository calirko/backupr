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
import { useIsMobile } from "@/hooks/use-mobile";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "../ui/drawer";
import { XSquareIcon, ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export default function AgentLogsDialog({
	open,
	onClose,
	agentId,
}: {
	open: boolean;
	agentId: string;
	onClose: (result: boolean) => void;
}): React.JSX.Element {
	const isMobile = useIsMobile();
	const [content, setContent] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const scrollRef = useRef<HTMLPreElement>(null);

	useEffect(() => {
		if (open && agentId) {
			fetchLogs();
		}
	}, [open, agentId]);

	useEffect(() => {
		if (content && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [content]);

	async function fetchLogs() {
		setLoading(true);
		try {
			const res = await fetch(`/api/agents/${agentId}/logs`, {
				headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
			});
			if (res.ok) {
				const data = await res.json();
				setContent(data.content ?? "(no content)");
			} else {
				const err = await res.json();
				toast.error("Failed to fetch logs", { description: err.error });
				setContent(null);
			}
		} catch (error) {
			toast.error("Failed to fetch logs", {
				description: error instanceof Error ? error.message : String(error),
			});
			setContent(null);
		} finally {
			setLoading(false);
		}
	}

	const logView = (
		<pre
			ref={scrollRef}
			className="text-xs font-mono bg-muted rounded-md p-3 overflow-y-auto whitespace-pre-wrap break-all"
			style={{ maxHeight: "60vh", minHeight: "200px" }}
		>
			{loading
				? "Loading logs…"
				: content ?? "No log content available."}
		</pre>
	);

	if (isMobile) {
		return (
			<Drawer open={open} onOpenChange={onClose}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>Agent Logs</DrawerTitle>
						<DrawerDescription>
							Live log output from the agent service
						</DrawerDescription>
					</DrawerHeader>
					<div className="px-4 pb-4">{logView}</div>
					<DrawerFooter>
						<Button
							variant="outline"
							size="sm"
							disabled={loading}
							onClick={fetchLogs}
						>
							<ArrowsClockwiseIcon />
							Refresh
						</Button>
						<DrawerClose asChild>
							<Button variant="outline">
								<XSquareIcon />
								Close
							</Button>
						</DrawerClose>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="max-w-3xl!">
				<DialogHeader>
					<DialogTitle>Agent Logs</DialogTitle>
					<DialogDescription>
						Live log output from the agent service
					</DialogDescription>
				</DialogHeader>
				{logView}
				<DialogFooter>
					<Button
						variant="outline"
						size="sm"
						disabled={loading}
						onClick={fetchLogs}
					>
						<ArrowsClockwiseIcon />
						Refresh
					</Button>
					<DialogClose asChild>
						<Button variant="outline">
							<XSquareIcon />
							Close
						</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
