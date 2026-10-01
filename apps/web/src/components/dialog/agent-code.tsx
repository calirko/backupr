import { ClipboardIcon, KeyIcon, XSquareIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { NoticeCard } from "../notice-card";
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
import { Spinner } from "../ui/spinner";
import { Textarea } from "../ui/textarea";

interface PairedSession {
	id: string;
	last_seen_at: string;
	info: { hostname?: string } | null;
}

export default function AgentCodeDialog({
	open,
	onClose,
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
	// Machines already paired with this agent. Pairing a new one revokes them,
	// so the code is only fetched after the user acknowledges that.
	const [sessions, setSessions] = useState<PairedSession[]>([]);
	const isMobile = useIsMobile();

	async function fetchSessions() {
		setLoading(true);

		try {
			const response = await fetch(`/api/agents/${agentId}`, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error ?? response.statusText);

			const paired: PairedSession[] = result.agentSessions ?? [];
			setSessions(paired);
			if (paired.length === 0) {
				await fetchAgentCode();
				return;
			}
		} catch (error) {
			console.error("Failed to fetch agent sessions", error);
			toast.error("Failed to fetch agent", {
				description: error instanceof Error ? error.message : String(error),
			});
		}
		setLoading(false);
	}

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
		fetchSessions();
	}, [agentId]);

	const needsConfirm = !data.agentCode && sessions.length > 0;

	const warning = sessions.length > 0 && (
		<NoticeCard variant="warning">
			<strong>This agent is already paired.</strong> Pairing with a new code
			disconnects and revokes the current session, so only the new machine will
			run this agent's jobs:
			<ul className="mt-1.5 list-disc pl-4">
				{sessions.map((session) => (
					<li key={session.id}>
						{session.info?.hostname ?? "Unknown host"} (last seen{" "}
						{new Date(session.last_seen_at).toLocaleString()})
					</li>
				))}
			</ul>
		</NoticeCard>
	);

	const primaryAction = needsConfirm ? (
		<Button disabled={loading} onClick={fetchAgentCode}>
			<KeyIcon />
			Generate Code
		</Button>
	) : (
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
	);

	const content = loading ? (
		<div className="flex items-center justify-center h-40">
			<Spinner />
		</div>
	) : needsConfirm ? (
		warning
	) : (
		<div className="space-y-2">
			{warning}
			<div className="space-y-1.5">
				<Textarea
					readOnly
					placeholder="Agent code"
					value={data.agentCode}
					className="h-25 resize-none break-all"
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
					<span className="px-4">{content}</span>
					<DrawerFooter>
						<DrawerClose asChild>
							<Button variant="outline">
								<XSquareIcon />
								Close
							</Button>
						</DrawerClose>
						{primaryAction}
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
					{primaryAction}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
