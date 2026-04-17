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
import { FloppyDiskIcon, PlusIcon, XSquareIcon } from "@phosphor-icons/react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { toast } from "sonner";

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
	};
	agentId?: string;
	onClose: (result: boolean) => void;
	onConfirm: () => void;
}): React.JSX.Element {
	const isMobile = useIsMobile();

	async function updateAgent({ name }: { name: string }) {
		try {
			const response = await fetch(`/api/agents/${agentId}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
				body: JSON.stringify({ name }),
			});
			if (!response.ok) {
				const error = await response.json();
				console.error(error);
				toast.error("Failed to update agent", { description: error.error });
			} else {
				toast.success("Agent updated successfully", {
					description: "The agent has been updated successfully.",
				});
				onClose(true);
			}
		} catch (error) {
			console.error(error);
			toast.error("Failed to update agent", {
				description: error instanceof Error ? error.message : String(error),
			});
		}
	}

	async function createAgent({ name }: { name: string }) {
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
			} else {
				toast.success("Agent created successfully", {
					description: "The agent has been created successfully.",
				});
				onClose(true);
			}
		} catch (error) {
			console.error(error);
			toast.error("Failed to create agent", {
				description: error instanceof Error ? error.message : String(error),
			});
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

		if (agentId) {
			await updateAgent({ name });
		} else {
			await createAgent({ name });
		}
		onConfirm();
	}

	const content = (
		<form onSubmit={handleConfirm} id="manage-agent">
			<div className="space-y-1.5">
				<Label>Name</Label>
				<Input
					placeholder="Name"
					name="name"
					defaultValue={defaultData?.name}
				/>
			</div>
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
					{content}
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
