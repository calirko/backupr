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
import { ClipboardIcon, XSquareIcon } from "@phosphor-icons/react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "../ui/spinner";

export default function AgentCodeDialog({
	open,
	onClose,
	onConfirm,
	agentId,
}: {
	open: boolean;
	agentId?: string;
	onClose: (result: boolean) => void;
	onConfirm: () => void;
}): React.JSX.Element {
	const [data, setData] = useState({
		agentCode: "",
		expiresAt: new Date(),
	});
	const [loading, setLoading] = useState(true);
	const isMobile = useIsMobile();

	async function fetchAgentCode() {
		setLoading(true);

		try {
			const response = await fetch(`/api/agents/${agentId}/code`, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
			});
			const result = await response.json();

			if (response.ok) {
				setData({
					agentCode: result.agent_code,
					expiresAt: new Date(result.expires_at),
				});
			} else {
				console.error("Failed to fetch agent code", result);
				toast.error("Failed to fetch agent code", {
					description: result.message,
				});
			}
		} catch (error) {
			console.error("Failed to fetch agent code", error);
			toast.error("Failed to fetch agent code", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		fetchAgentCode();
	}, [agentId]);

	const content = loading ? (
		<div className="flex items-center justify-center h-40">
			<Spinner />
		</div>
	) : (
		<div className="space-y-2">
			<div className="space-y-1.5">
				<Textarea
					readOnly
					placeholder="Agent code"
					value={data.agentCode}
					className="h-25 resize-none"
				/>
			</div>
			{data.expiresAt && (
				<p className="text-muted-foreground text-xs">
					This code will expire at {data.expiresAt.toLocaleString()}.
				</p>
			)}
		</div>
	);

	if (isMobile) {
		return (
			<Drawer open={open} onOpenChange={onClose}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>Agent Code</DrawerTitle>
						<DrawerDescription>Manage the agent's code.</DrawerDescription>
					</DrawerHeader>
					{content}
					<DrawerFooter>
						<DrawerClose asChild>
							<Button variant="outline">
								<XSquareIcon />
								Close
							</Button>
						</DrawerClose>
						<Button
							disabled={loading || !data.agentCode}
							onClick={() => {
								navigator.clipboard.writeText(data.agentCode);
								toast("Copied to clipboard", {
									description: data.agentCode,
								});
							}}
						>
							<ClipboardIcon />
							Copy to Clipboard
						</Button>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Agent Code</DialogTitle>
					<DialogDescription>Manage the agent's code.</DialogDescription>
				</DialogHeader>
				{content}
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline">
							<XSquareIcon />
							Close
						</Button>
					</DialogClose>
					<Button
						disabled={loading || !data.agentCode}
						onClick={() => {
							navigator.clipboard.writeText(data.agentCode);
							toast("Copied to clipboard", {
								description: data.agentCode,
							});
						}}
					>
						<ClipboardIcon />
						Copy to Clipboard
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
