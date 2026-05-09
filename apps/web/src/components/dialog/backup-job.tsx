import { FloppyDiskIcon, PlusIcon, XSquareIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { NoticeCard } from "../notice-card";
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
import { InputPassword } from "../ui/input-password";
import { Label } from "../ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";

interface Agent {
	id: string;
	name: string;
}

interface BackupPolicy {
	id: string;
	keep_last_n_backups: number | null;
	max_backup_age_in_days: number | null;
}

interface BackupJobData {
	name: string;
	cron?: string;
	files?: string[];
	agent_id?: string;
	is_active?: boolean;
	use_password?: boolean;
	password?: string;
	compression_level?: number;
	policy_id?: string | null;
}

function policyLabel(policy: BackupPolicy): string {
	const parts: string[] = [];
	if (policy.keep_last_n_backups != null)
		parts.push(`Keep last ${policy.keep_last_n_backups}`);
	if (policy.max_backup_age_in_days != null)
		parts.push(`Max ${policy.max_backup_age_in_days}d`);
	return parts.join(" · ");
}

export default function BackupJobDialog({
	open,
	onClose,
	onConfirm,
	backupJobId,
	defaultData,
	readonly,
	title,
}: {
	open: boolean;
	onClose: (result: boolean) => void;
	onConfirm: () => void;
	backupJobId?: string;
	defaultData?: BackupJobData;
	readonly?: boolean;
	title?: string;
}): React.JSX.Element {
	const isMobile = useIsMobile();
	const [agents, setAgents] = useState<Agent[]>([]);
	const [agentsLoading, setAgentsLoading] = useState(false);
	const [policies, setPolicies] = useState<BackupPolicy[]>([]);
	const [usePassword, setUsePassword] = useState(
		defaultData?.use_password || false,
	);

	useEffect(() => {
		fetchAgents();
		fetchPolicies();
	}, []);

	async function fetchAgents() {
		setAgentsLoading(true);
		try {
			const response = await fetch("/api/agents?take=100", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
			});
			if (response.ok) {
				const result = await response.json();
				setAgents(result.data || []);
			}
		} catch (error) {
			console.error("Failed to fetch agents:", error);
		} finally {
			setAgentsLoading(false);
		}
	}

	async function fetchPolicies() {
		try {
			const response = await fetch("/api/backup-policies?take=100", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
			});
			if (response.ok) {
				const result = await response.json();
				setPolicies(result.data || []);
			}
		} catch (error) {
			console.error("Failed to fetch policies:", error);
		}
	}

	async function updateBackupJob(jobData: BackupJobData) {
		try {
			const response = await fetch(`/api/backup-jobs/${backupJobId}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
				body: JSON.stringify(jobData),
			});
			if (!response.ok) {
				const error = await response.json();
				console.error(error);
				toast.error("Failed to update backup job", {
					description: error.error,
				});
			} else {
				toast.success("Backup job updated successfully");
				onClose(true);
			}
		} catch (error) {
			console.error(error);
			toast.error("Failed to update backup job", {
				description: error instanceof Error ? error.message : String(error),
			});
		}
	}

	async function createBackupJob(jobData: BackupJobData) {
		try {
			const response = await fetch("/api/backup-jobs", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
				body: JSON.stringify(jobData),
			});
			if (!response.ok) {
				const error = await response.json();
				console.error(error);
				toast.error("Failed to create backup job", {
					description: error.error,
				});
			} else {
				toast.success("Backup job created successfully");
				onClose(true);
			}
		} catch (error) {
			console.error(error);
			toast.error("Failed to create backup job", {
				description: error instanceof Error ? error.message : String(error),
			});
		}
	}

	async function handleConfirm(form: React.SubmitEvent<HTMLFormElement>) {
		form.preventDefault();
		const formData = new FormData(form.currentTarget);

		const cron = formData.get("cron") as string;
		const agentId = formData.get("agent_id") as string;
		const filesInput = formData.get("files") as string;
		const isActive = formData.get("is_active") === "on";
		const password = usePassword
			? (formData.get("password") as string) || undefined
			: undefined;

		if (usePassword && !password) {
			toast.warning("Password required", {
				description: "Please enter a password for password protection.",
			});
			return;
		}

		const compressionLevel = parseInt(
			formData.get("compression_level") as string,
			10,
		);
		const name = formData.get("name") as string;
		const rawPolicyId = formData.get("policy_id") as string;
		const policyId = rawPolicyId && rawPolicyId !== "none" ? rawPolicyId : null;

		if (!cron || !agentId || !filesInput || !name) {
			toast.warning("Required fields missing", {
				description: "Please fill in all required fields.",
			});
			return;
		}

		const files = filesInput
			.split("\n")
			.map((f) => f.trim())
			.filter((f) => f.length > 0);

		if (files.length === 0) {
			toast.warning("No files specified", {
				description: "Please enter at least one file or directory path.",
			});
			return;
		}

		const jobData: BackupJobData = {
			name,
			cron,
			agent_id: agentId,
			files,
			is_active: isActive,
			use_password: usePassword,
			password,
			compression_level: compressionLevel,
			policy_id: policyId,
		};

		if (backupJobId) {
			await updateBackupJob(jobData);
		} else {
			await createBackupJob(jobData);
		}
		onConfirm();
	}

	const content = (
		<form onSubmit={handleConfirm} id="manage-backup-job" className="space-y-4">
			<div className="space-y-1.5">
				<Label required htmlFor="agent_id">
					Agent
				</Label>
				<Select
					defaultValue={defaultData?.agent_id || ""}
					disabled={readonly || agentsLoading}
					name="agent_id"
				>
					<SelectTrigger id="agent_id" className="w-full">
						<SelectValue placeholder="Select an agent" />
					</SelectTrigger>
					<SelectContent>
						{agents.map((agent) => (
							<SelectItem key={agent.id} value={agent.id}>
								{agent.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="space-y-1.5">
				<Label required htmlFor="name">
					Job Name
				</Label>
				<Input
					id="name"
					placeholder="Daily Backup"
					name="name"
					defaultValue={defaultData?.name || ""}
					disabled={readonly}
				/>
			</div>

			<div className="space-y-1.5">
				<Label required htmlFor="cron">
					Cron Expression
				</Label>
				<Input
					id="cron"
					placeholder="0 2 * * * (daily at 2 AM)"
					name="cron"
					defaultValue={defaultData?.cron || ""}
					disabled={readonly}
				/>
				<p className="text-xs text-muted-foreground">
					Use standard cron expression format (e.g., "0 2 * * *" for daily at 2
					AM)
				</p>
			</div>

			<div className="space-y-1.5">
				<Label required htmlFor="files">
					Files/Directories
				</Label>
				<Textarea
					id="files"
					placeholder="/path/to/file&#10;/path/to/directory"
					name="files"
					defaultValue={defaultData?.files ? defaultData.files.join("\n") : ""}
					disabled={readonly}
					rows={4}
				/>
				<p className="text-xs text-muted-foreground">
					Enter one path per line. Use absolute paths.
				</p>
			</div>

			<div className="space-y-2">
				<Label>Compression</Label>
				<Select
					defaultValue={String(defaultData?.compression_level || 9)}
					disabled={readonly}
					name="compression_level"
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Select compression level" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="0">No Compression</SelectItem>
						<SelectItem value="1">Low (1)</SelectItem>
						<SelectItem value="5">Medium (5)</SelectItem>
						<SelectItem value="9">High (9)</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div>
				<NoticeCard>
					<strong>Note:</strong> Compression level 0 is fastest but results in
					larger backup files. Level 9 provides maximum compression but may take
					significantly longer, and cause system instability during backup.
					Level 5 is a good balance for most use cases.
				</NoticeCard>
			</div>

			<div className="space-y-1.5">
				<Label htmlFor="policy_id">Retention Policy</Label>
				<Select
					defaultValue={defaultData?.policy_id ?? "none"}
					disabled={readonly}
					name="policy_id"
				>
					<SelectTrigger id="policy_id" className="w-full">
						<SelectValue placeholder="No policy" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="none">No policy</SelectItem>
						{policies.map((policy) => (
							<SelectItem key={policy.id} value={policy.id}>
								{policyLabel(policy)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="space-y-2">
				<div className="flex items-center gap-2">
					<Checkbox
						id="use_password"
						name="use_password"
						checked={usePassword}
						onCheckedChange={(v) => setUsePassword(v === true)}
						disabled={readonly}
						className="mb-0"
					/>
					<Label htmlFor="use_password" className="cursor-pointer">
						Password Protection
					</Label>
				</div>
				{usePassword && (
					<InputPassword
						name="password"
						placeholder="Archive password"
						defaultValue={defaultData?.password || ""}
						disabled={readonly}
					/>
				)}
			</div>

			<div className="space-y-2 flex items-center gap-2">
				<Checkbox
					id="is_active"
					name="is_active"
					defaultChecked={defaultData?.is_active !== false}
					className="mb-0"
					disabled={readonly}
				/>
				<Label htmlFor="is_active" className="cursor-pointer">
					Active
				</Label>
			</div>
		</form>
	);

	if (isMobile) {
		return (
			<Drawer open={open} onOpenChange={onClose}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>
							{title ?? (backupJobId ? "Edit Backup Job" : "New Backup Job")}
						</DrawerTitle>
						<DrawerDescription>
							{backupJobId
								? "Update the backup job configuration."
								: "Create a new backup job with schedule and files."}
						</DrawerDescription>
					</DrawerHeader>
					<div className="px-4 overflow-y-auto flex-1">{content}</div>
					<DrawerFooter>
						<DrawerClose asChild>
							<Button variant="outline">
								<XSquareIcon />
								Cancel
							</Button>
						</DrawerClose>
						{!readonly && (
							<Button form="manage-backup-job" type="submit">
								{backupJobId ? (
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
						{title ?? (backupJobId ? "Edit Backup Job" : "New Backup Job")}
					</DialogTitle>
					<DialogDescription>
						{backupJobId
							? "Update the backup job configuration."
							: "Create a new backup job with schedule and files."}
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
						<Button form="manage-backup-job" type="submit">
							{backupJobId ? (
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
