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
	IN_PROGRESS: { color: "oklch(0.64 0.08 228)" },
	PENDING: {},
};

export const BACKUP_STATUS_BADGE_VARIANT: Record<
	BackupStatus,
	"success" | "error" | "default"
> = {
	COMPLETED: "success",
	FAILED: "error",
	IN_PROGRESS: "default",
	PENDING: "default",
};
