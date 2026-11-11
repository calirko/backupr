import type { BadgeVariant } from "@/components/ui/badge";
export type BackupStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export const BACKUP_STATUS_LABEL: Record<BackupStatus, string> = {
	PENDING: "Pending",
	IN_PROGRESS: "In Progress",
	COMPLETED: "Completed",
	FAILED: "Failed",
};

export const BACKUP_STATUS_STYLE: Record<BackupStatus, React.CSSProperties> = {
	COMPLETED: { color: "var(--greenish)" },
	FAILED: { color: "var(--destructive)" },
	IN_PROGRESS: { color: "var(--blueish)" },
	PENDING: {},
};

export const BACKUP_STATUS_BADGE_VARIANT: Record<BackupStatus, BadgeVariant> = {
	COMPLETED: "success",
	FAILED: "destructive",
	IN_PROGRESS: "info",
	PENDING: "muted",
};
