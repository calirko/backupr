"use client";

import { Cron } from "croner";
import {
	CopyIcon,
	EyeIcon,
	PencilIcon,
	PlusIcon,
	TestTubeIcon,
	XSquareIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import Data, { type Column } from "@/components/data/data";
import DataHeader, { type SearchField } from "@/components/data/dataHeader";
import { Button } from "@/components/ui/button";
import { useData } from "@/hooks/use-data";
import type { TableAction } from "@/components/data/dataActions";
import { useDialog } from "@/hooks/use-dialog";
import BackupJobDialog from "@/components/dialog/backup-job";
import ConfirmDialog from "@/components/dialog/confirm";
import TestJobDialog from "@/components/dialog/test-job";

export default function BackupJobsPage() {
	const { filters, orderBy } = useData("backup-jobs");
	const { openDialog } = useDialog();
	const [data, setData] = useState({
		data: [],
		total: 0,
		absoluteTotal: 0,
		schedulerTimezone: "UTC",
	});
	const [loading, setLoading] = useState(false);

	const filterFields = [
		{
			name: "agent.name",
			label: "Agent",
			type: "string" as const,
			matching: "contains" as const,
		},
		{
			name: "is_active",
			label: "Status",
			type: "select" as const,
			options: [
				{ value: "true", label: "Active" },
				{ value: "false", label: "Inactive" },
			],
		},
		{
			name: "cron",
			label: "Schedule",
			type: "string" as const,
			matching: "contains" as const,
		},
	] as SearchField[];

	const columns = [
		// { key: "id", label: "ID", orderable: true, width: "auto" as const },
		{ key: "name", label: "Name", orderable: true },
		{
			key: "agent",
			label: "Agent",
			orderable: true,
			orderByKey: "agent.name",
		},
		{ key: "cron", label: "Schedule", orderable: true },
		{
			key: "next_run",
			orderable: false,
			label: "Next Run",
			format: (value) =>
				value ? (
					new Date(value).toLocaleString()
				) : (
					<span className="text-muted-foreground">—</span>
				),
		},
		{
			key: "policy",
			label: "Policy",
			orderable: false,
			format: (value) => value ?? "—",
		},
		{
			key: "use_password",
			label: "Protected",
			format: (value) =>
				value ? "Yes" : <span className="text-muted-foreground">No</span>,
		},
		{
			key: "is_active",
			label: "Status",
			orderable: true,
			format: (value) =>
				value ? "Active" : <span className="text-destructive">Inactive</span>,
		},
		{
			key: "files",
			label: "Files/Directories",
			format: (value) => {
				if (Array.isArray(value)) {
					return value.length > 0 ? `${value.length} item(s)` : "None";
				}
				return "N/A";
			},
		},
		{
			key: "created_at",
			label: "Created",
			orderable: true,
			format: (value) => new Date(value).toLocaleString(),
		},
		{
			key: "updated_at",
			label: "Updated",
			orderable: true,
			format: (value) => new Date(value).toLocaleString(),
		},
	] as Column[];

	const actions = [
		{
			id: "action",
			label: "Actions",
		},
		{
			id: "test",
			label: "Test Job",
			icon: <TestTubeIcon />,
			onClick: (row) => {
				openDialog(TestJobDialog, {
					jobId: row.id,
					jobName: row.name,
				});
			},
		},
		{
			id: "divider",
			divider: true,
		},
		{
			id: "mange",
			label: "Manage",
		},
		{
			id: "view",
			label: "View",
			icon: <EyeIcon />,
			onClick: (row) => {
				openDialog(BackupJobDialog, {
					defaultData: row,
					backupJobId: row.id,
					readonly: true,
					onConfirm: () => {
						fetchData();
					},
				});
			},
		},
		{
			id: "edit",
			label: "Edit",
			icon: <PencilIcon />,
			onClick: (row) => {
				openDialog(BackupJobDialog, {
					defaultData: row,
					backupJobId: row.id,
					onConfirm: () => {
						fetchData();
					},
				});
			},
		},
		{
			id: "duplicate",
			label: "Duplicate",
			icon: <CopyIcon />,
			onClick: (row) => {
				openDialog(BackupJobDialog, {
					title: "Duplicate Backup Job",
					defaultData: { ...row, agent_id: undefined },
					onConfirm: () => {
						fetchData();
					},
				});
			},
		},
		{
			id: "separator",
			divider: true,
		},
		{
			id: "danger",
			label: "Dangerous",
		},
		{
			id: "delete",
			label: "Delete",
			icon: <XSquareIcon />,
			variant: "destructive" as const,
			onClick: (row) => {
				openDialog(ConfirmDialog, {
					title: "Delete Backup Job",
					description:
						"Are you sure you want to delete this backup job? This action cannot be undone.",
					onConfirm: () => {
						deleteBackupJob(row.id);
					},
				});
			},
		},
	] as TableAction[];

	async function deleteBackupJob(jobId: string) {
		try {
			const response = await fetch(`/api/backup-jobs/${jobId}`, {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
			});
			if (response.ok) {
				toast.success("Backup job deleted successfully", {
					description: "The backup job has been deleted.",
				});
				fetchData();
			} else {
				const error = await response.json();
				toast.error("Error deleting backup job", {
					description: error.error || "Unknown error",
				});
			}
		} catch (error) {
			console.error(error);
			toast.error("Failed to delete backup job", {
				description: error instanceof Error ? error.message : String(error),
			});
		}
	}

	async function fetchData() {
		setLoading(true);

		try {
			const params = new URLSearchParams({
				filters: encodeURIComponent(JSON.stringify(filters)),
				orderBy: encodeURIComponent(JSON.stringify(orderBy)),
			});
			const response = await fetch(`/api/backup-jobs?${params}`, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
			});
			if (response.ok) {
				const result = await response.json();
				const prettyData = result.data.map((item: any) => {
					const policy = item.backupJobPolicies?.[0]?.backup_policy ?? null;
					const policyParts: string[] = [];
					if (policy?.keep_last_n_backups != null)
						policyParts.push(`Keep last ${policy.keep_last_n_backups}`);
					if (policy?.max_backup_age_in_days != null)
						policyParts.push(`Max ${policy.max_backup_age_in_days}d`);
					let next_run: Date | null = null;
					try {
						// Use server's timezone for cron calculation to match scheduler
						const cron = new Cron(item.cron);
						next_run = cron.nextRun();
					} catch {
						next_run = null;
					}
					return {
						...item,
						agent: item.agent.name || null,
						policy_id: item.backupJobPolicies?.[0]?.backup_policy_id ?? null,
						policy: policyParts.length ? policyParts.join(" · ") : null,
						next_run,
					};
				});
				setData({
					...data,
					data: prettyData,
					total: result.total,
					absoluteTotal: result.absoluteTotal,
					schedulerTimezone: result.schedulerTimezone,
				});
			} else {
				const error = await response.json();
				toast.error("Error fetching backup jobs", {
					description: error.error || "Unknown error",
				});
			}
		} catch (error) {
			console.error(error);
			toast.error("Failed to fetch backup jobs", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		fetchData();
	}, [filters, orderBy]);

	return (
		<div className="w-full grow px-3 sm:px-14 pt-4 flex flex-col gap-6">
			<div>
				<h1 className="text-4xl font-black">Backup Jobs</h1>
				<p className="text-muted-foreground text-sm">
					Manage your backup jobs and view their configuration details.
				</p>
			</div>
			<div className="flex-col flex gap-4">
				<DataHeader filterFields={filterFields} name="backup-jobs">
					<Button
						onClick={() => {
							openDialog(BackupJobDialog, {
								onConfirm: fetchData,
							});
						}}
					>
						<PlusIcon />
						New Backup Job
					</Button>
				</DataHeader>
				<Data
					showOrderBy
					actions={actions}
					columns={columns}
					data={data.data}
					loading={loading}
					name="backup-jobs"
					absoluteTotal={data.absoluteTotal}
				/>
			</div>
		</div>
	);
}
