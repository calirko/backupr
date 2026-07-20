import { FloppyDiskIcon, PlusIcon, XSquareIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
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
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface AgentResult {
	id: string;
	name: string;
}

export default function AgentDialog({
	open,
	onClose,
	onConfirm,
	agentId,
	defaultData,
}: {
	open: boolean;
	defaultData?: {
		name: string;
		is_active?: boolean;
	};
	agentId?: string;
	onClose: (result: boolean) => void;
	onConfirm: (agent?: AgentResult) => void;
}): React.JSX.Element {
	const isMobile = useIsMobile();
	const [isActive, setIsActive] = useState(defaultData?.is_active ?? true);

	async function updateAgent({
		name,
	}: {
		name: string;
	}): Promise<AgentResult | undefined> {
		try {
			const response = await fetch(`/api/agents/${agentId}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
				body: JSON.stringify({ name, is_active: isActive }),
			});
			if (!response.ok) {
				const error = await response.json();
				console.error(error);
				toast.error("Failed to update agent", { description: error.error });
				return undefined;
			}
			toast.success("Agent updated successfully", {
				description: "The agent has been updated successfully.",
			});
			onClose(true);
			return { id: agentId as string, name };
		} catch (error) {
			console.error(error);
			toast.error("Failed to update agent", {
				description: error instanceof Error ? error.message : String(error),
			});
			return undefined;
		}
	}

	async function createAgent({
		name,
	}: {
		name: string;
	}): Promise<AgentResult | undefined> {
		try {
			const response = await fetch(`/api/agents`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
				body: JSON.stringify({ name }),
			});
			if (!response.ok) {
				const error = await response.json();
				console.error(error);
				toast.error("Failed to create agent", { description: error.error });
				return undefined;
			}
			const created = await response.json();
			toast.success("Agent created successfully", {
				description: "The agent has been created successfully.",
			});
			onClose(true);
			return { id: created.id, name };
		} catch (error) {
			console.error(error);
			toast.error("Failed to create agent", {
				description: error instanceof Error ? error.message : String(error),
			});
			return undefined;
		}
	}

	async function handleConfirm(form: React.SubmitEvent<HTMLFormElement>) {
		form.preventDefault();
		const formData = new FormData(form.currentTarget);
		const name = formData.get("name") as string;

		if (!name) {
			toast.warning("Name is required", {
				description: "Please enter a name for the agent.",
			});
			return;
		}

		const result = agentId
			? await updateAgent({ name })
			: await createAgent({ name });
		onConfirm(result);
	}

	const content = (
		<form onSubmit={handleConfirm} id="manage-agent" className="space-y-4">
			<div className="space-y-1.5">
				<Label>Name</Label>
				<Input
					placeholder="Name"
					name="name"
					defaultValue={defaultData?.name}
				/>
			</div>
			{agentId && (
				<div className="flex items-center gap-2">
					<Checkbox
						id="is_active"
						checked={isActive}
						onCheckedChange={(checked) => setIsActive(checked === true)}
					/>
					<Label htmlFor="is_active">Active</Label>
				</div>
			)}
		</form>
	);

	if (isMobile) {
		return (
			<Drawer open={open} onOpenChange={onClose}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>{agentId ? "Edit Agent" : "Add Agent"}</DrawerTitle>
						<DrawerDescription>
							{agentId ? "Edit the agent's details." : "Add a new agent."}
						</DrawerDescription>
					</DrawerHeader>
					<span className="px-4">{content}</span>
					<DrawerFooter>
						<DrawerClose asChild>
							<Button variant="outline">
								<XSquareIcon />
								Cancel
							</Button>
						</DrawerClose>
						<Button form="manage-agent" type="submit">
							{agentId ? (
								<>
									<FloppyDiskIcon />
									Save
								</>
							) : (
								<>
									<PlusIcon />
									Add
								</>
							)}
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
					<DialogTitle>{agentId ? "Edit Agent" : "Add Agent"}</DialogTitle>
					<DialogDescription>
						{agentId ? "Edit the agent's details." : "Add a new agent."}
					</DialogDescription>
				</DialogHeader>
				{content}
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline">
							<XSquareIcon />
							Cancel
						</Button>
					</DialogClose>
					<Button form="manage-agent" type="submit">
						{agentId ? (
							<>
								<FloppyDiskIcon />
								Save
							</>
						) : (
							<>
								<PlusIcon />
								Add
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
