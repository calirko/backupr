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

export default function UserDialog({
	open,
	onClose,
	onConfirm,
	userId,
	defaultData,
}: {
	open: boolean;
	defaultData?: {
		name: string;
		email: string;
	};
	userId?: string;
	onClose: (result: boolean) => void;
	onConfirm: () => void;
}): React.JSX.Element {
	const isMobile = useIsMobile();

	async function updateUser({ name }: { name: string }) {
		try {
			const response = await fetch(`/api/users/${userId}`, {
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
				toast.error("Failed to update user", { description: error.error });
			} else {
				toast.success("User updated successfully", {
					description: "The user has been updated successfully.",
				});
				onClose(true);
			}
		} catch (error) {
			console.error(error);
			toast.error("Failed to update user", {
				description: error instanceof Error ? error.message : String(error),
			});
		}
	}

	async function createUser({
		name,
		email,
		password,
	}: {
		name: string;
		email: string;
		password: string;
	}) {
		try {
			const response = await fetch(`/api/users`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
				body: JSON.stringify({ name, email, password }),
			});
			if (!response.ok) {
				const error = await response.json();
				console.error(error);
				toast.error("Failed to create user", { description: error.error });
			} else {
				toast.success("User created successfully", {
					description: "The user has been created successfully.",
				});
				onClose(true);
			}
		} catch (error) {
			console.error(error);
			toast.error("Failed to create user", {
				description: error instanceof Error ? error.message : String(error),
			});
		}
	}

	async function handleConfirm(form: React.SubmitEvent<HTMLFormElement>) {
		form.preventDefault();
		const formData = new FormData(form.currentTarget);
		const name = formData.get("name") as string;
		const email = formData.get("email") as string;
		const password = formData.get("password") as string;

		if (!name) {
			toast.warning("Name is required", {
				description: "Please enter a name for the user.",
			});
			return;
		}

		if (userId) {
			await updateUser({ name });
		} else {
			await createUser({ name, email, password });
		}
		onConfirm();
	}

	const content = (
		<form onSubmit={handleConfirm} id="manage-user" className="space-y-4">
			<div className="space-y-1.5">
				<Label>Name</Label>
				<Input
					placeholder="Name"
					name="name"
					defaultValue={defaultData?.name}
				/>
			</div>
			<div className="space-y-1.5">
				<Label>Email</Label>
				<Input
					placeholder="Email"
					name="email"
					defaultValue={defaultData?.email}
				/>
			</div>
			{userId ? (
				<div></div>
			) : (
				<div className="space-y-1.5">
					<Label>Password</Label>
					<Input placeholder="Password" name="password" type="password" />
				</div>
			)}
		</form>
	);

	if (isMobile) {
		return (
			<Drawer open={open} onOpenChange={onClose}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>{userId ? "Edit User" : "Add User"}</DrawerTitle>
						<DrawerDescription>
							{userId ? "Edit the user's details." : "Add a new user."}
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
						<Button form="manage-user" type="submit">
							{userId ? (
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
					<DialogTitle>{userId ? "Edit User" : "Add User"}</DialogTitle>
					<DialogDescription>
						{userId ? "Edit the user's details." : "Add a new user."}
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
					<Button form="manage-user" type="submit">
						{userId ? (
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
