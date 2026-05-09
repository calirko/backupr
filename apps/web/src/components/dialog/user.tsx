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
import { InputPassword } from "../ui/input-password";
import { NoticeCard } from "../notice-card";

export default function UserDialog({
	open,
	onClose,
	onConfirm,
	userId,
	defaultData,
	readonly,
}: {
	open: boolean;
	defaultData?: {
		name: string;
		username: string;
		email: string;
	};
	userId?: string;
	readonly?: boolean;
	onClose: (result: boolean) => void;
	onConfirm: () => void;
}): React.JSX.Element {
	const isMobile = useIsMobile();

	async function updateUser({
		name,
		username,
		password,
	}: {
		name: string;
		username: string;
		password?: string;
	}) {
		try {
			const updateData: { name: string; username: string; password?: string } =
				{ name, username };
			if (password) {
				updateData.password = password;
			}
			const response = await fetch(`/api/users/${userId}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
				body: JSON.stringify(updateData),
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
		username,
		email,
		password,
	}: {
		name: string;
		username: string;
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
				body: JSON.stringify({ name, username, email, password }),
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
		const username = formData.get("username") as string;
		const email = formData.get("email") as string;
		const password = formData.get("password") as string;

		if (!name) {
			toast.warning("Name is required", {
				description: "Please enter a name for the user.",
			});
			return;
		}

		if (!username) {
			toast.warning("Username is required", {
				description: "Please enter a username for the user.",
			});
			return;
		}

		if (userId) {
			await updateUser({ name, username, password: password || undefined });
		} else {
			if (!email || !password) {
				toast.warning("Email and password required", {
					description: "Please enter both email and password for new users.",
				});
				return;
			}
			await createUser({ name, username, email, password });
		}
		onConfirm();
	}

	const content = (
		<form onSubmit={handleConfirm} id="manage-user" className="space-y-4">
			<div className="space-y-1.5">
				<Label required={!readonly}>Name</Label>
				<Input
					placeholder="Name"
					name="name"
					defaultValue={defaultData?.name}
					disabled={readonly}
				/>
			</div>
			<div className="space-y-1.5">
				<Label required={!readonly}>Username</Label>
				<Input
					placeholder="Username"
					name="username"
					defaultValue={defaultData?.username}
					disabled={readonly}
				/>
			</div>
			<div className="space-y-1.5">
				<Label required={!readonly}>Email</Label>
				<Input
					placeholder="Email"
					name="email"
					defaultValue={defaultData?.email}
					disabled={readonly}
				/>
			</div>
			{!readonly && !userId && (
				<div className="space-y-1.5">
					<Label required>Password</Label>
					<InputPassword
						placeholder="Password"
						name="password"
						type="password"
						required={!userId}
					/>
				</div>
			)}
			{!readonly && userId && (
				<>
					<div className="space-y-1.5">
						<Label>Password</Label>
						<InputPassword
							placeholder="Leave empty to keep current password"
							name="password"
							type="password"
						/>
					</div>
					<NoticeCard>
						<strong>Note:</strong> Leave the password field empty if you don't
						want to change it. Only fill in this field if you want to set a new
						password for this user.
					</NoticeCard>
				</>
			)}
		</form>
	);

	const title = readonly ? "View User" : userId ? "Edit User" : "Add User";
	const description = readonly
		? "Viewing user details."
		: userId
			? "Edit the user's details."
			: "Add a new user.";

	if (isMobile) {
		return (
			<Drawer open={open} onOpenChange={onClose}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>{title}</DrawerTitle>
						<DrawerDescription>{description}</DrawerDescription>
					</DrawerHeader>
					{content}
					<DrawerFooter>
						<DrawerClose asChild>
							<Button variant="outline">
								<XSquareIcon />
								{readonly ? "Close" : "Cancel"}
							</Button>
						</DrawerClose>
						{!readonly && (
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
						)}
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				{content}
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline">
							<XSquareIcon />
							{readonly ? "Close" : "Cancel"}
						</Button>
					</DialogClose>
					{!readonly && (
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
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
