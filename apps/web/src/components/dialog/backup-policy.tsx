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

interface BackupPolicyData {
	keep_last_n_backups?: number | null;
	max_backup_age_in_days?: number | null;
}

export default function BackupPolicyDialog({
	open,
	onClose,
	onConfirm,
	policyId,
	defaultData,
	readonly,
}: {
	open: boolean;
	onClose: (result: boolean) => void;
	onConfirm: () => void;
	policyId?: string;
	defaultData?: BackupPolicyData;
	readonly?: boolean;
}): React.JSX.Element {
	const isMobile = useIsMobile();

	async function updateBackupPolicy(policyData: BackupPolicyData) {
		try {
			const response = await fetch(`/api/backup-policies/${policyId}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
				body: JSON.stringify(policyData),
			});
			if (!response.ok) {
				const error = await response.json();
				console.error(error);
				toast.error("Failed to update backup policy", {
					description: error.error,
				});
			} else {
				toast.success("Backup policy updated successfully");
				onClose(true);
			}
		} catch (error) {
			console.error(error);
			toast.error("Failed to update backup policy", {
				description: error instanceof Error ? error.message : String(error),
			});
		}
	}

	async function createBackupPolicy(policyData: BackupPolicyData) {
		try {
			const response = await fetch("/api/backup-policies", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
				body: JSON.stringify(policyData),
			});
			if (!response.ok) {
				const error = await response.json();
				console.error(error);
				toast.error("Failed to create backup policy", {
					description: error.error,
				});
			} else {
				toast.success("Backup policy created successfully");
				onClose(true);
			}
		} catch (error) {
			console.error(error);
			toast.error("Failed to create backup policy", {
				description: error instanceof Error ? error.message : String(error),
			});
		}
	}

	async function handleConfirm(form: React.SubmitEvent<HTMLFormElement>) {
		form.preventDefault();
		const formData = new FormData(form.currentTarget);

		const keepLastNBackups = formData.get("keep_last_n_backups") as string;
		const maxBackupAgeInDays = formData.get("max_backup_age_in_days") as string;

		if (!keepLastNBackups && !maxBackupAgeInDays) {
			toast.warning("At least one field required", {
				description: "Please specify at least one retention rule.",
			});
			return;
		}

		const policyData: BackupPolicyData = {
			keep_last_n_backups: keepLastNBackups
				? parseInt(keepLastNBackups, 10)
				: null,
			max_backup_age_in_days: maxBackupAgeInDays
				? parseInt(maxBackupAgeInDays, 10)
				: null,
		};

		if (policyId) {
			await updateBackupPolicy(policyData);
		} else {
			await createBackupPolicy(policyData);
		}
		onConfirm();
	}

	const content = (
		<form
			onSubmit={handleConfirm}
			id="manage-backup-policy"
			className="space-y-4"
		>
			<div className="space-y-1.5">
				<Label htmlFor="keep_last_n_backups">Keep Last N Backups</Label>
				<Input
					id="keep_last_n_backups"
					placeholder="e.g., 10"
					name="keep_last_n_backups"
					type="number"
					min="1"
					defaultValue={
						defaultData?.keep_last_n_backups
							? String(defaultData.keep_last_n_backups)
							: ""
					}
					disabled={readonly}
				/>
				<p className="text-xs text-muted-foreground">
					Leave empty to keep all backups. If set, older backups will be
					automatically deleted.
				</p>
			</div>

			<div className="space-y-1.5">
				<Label htmlFor="max_backup_age_in_days">Max Backup Age (Days)</Label>
				<Input
					id="max_backup_age_in_days"
					placeholder="e.g., 30"
					name="max_backup_age_in_days"
					type="number"
					min="1"
					defaultValue={
						defaultData?.max_backup_age_in_days
							? String(defaultData.max_backup_age_in_days)
							: ""
					}
					disabled={readonly}
				/>
				<p className="text-xs text-muted-foreground">
					Leave empty for no age limit. Backups older than this many days will
					be automatically deleted.
				</p>
			</div>

			<div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-3">
				<p className="text-xs text-blue-800 dark:text-blue-200">
					<strong>Note:</strong> You can set both rules. The policy will apply
					whichever condition would result in more backup retention. At least
					one rule must be configured.
				</p>
			</div>
		</form>
	);

	if (isMobile) {
		return (
			<Drawer open={open} onOpenChange={onClose}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>
							{policyId ? "Edit Backup Policy" : "New Backup Policy"}
						</DrawerTitle>
						<DrawerDescription>
							{policyId
								? "Update the backup retention policy."
								: "Create a new backup retention policy."}
						</DrawerDescription>
					</DrawerHeader>
					<div className="px-4">{content}</div>
					<DrawerFooter>
						<DrawerClose asChild>
							<Button variant="outline">
								<XSquareIcon />
								Cancel
							</Button>
						</DrawerClose>
						{!readonly && (
							<Button form="manage-backup-policy" type="submit">
								{policyId ? (
									<>
										<FloppyDiskIcon />
										Save
									</>
								) : (
									<>
										<PlusIcon />
										Create
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
			<DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>
						{policyId ? "Edit Backup Policy" : "New Backup Policy"}
					</DialogTitle>
					<DialogDescription>
						{policyId
							? "Update the backup retention policy."
							: "Create a new backup retention policy."}
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
					{!readonly && (
						<Button form="manage-backup-policy" type="submit">
							{policyId ? (
								<>
									<FloppyDiskIcon />
									Save
								</>
							) : (
								<>
									<PlusIcon />
									Create
								</>
							)}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
