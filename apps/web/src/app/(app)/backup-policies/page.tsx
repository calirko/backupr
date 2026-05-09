"use client";

import {
	EyeIcon,
	PencilIcon,
	PlusIcon,
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
import BackupPolicyDialog from "@/components/dialog/backup-policy";
import ConfirmDialog from "@/components/dialog/confirm";

export default function BackupPoliciesPage() {
	const { filters, orderBy } = useData("backup-policies");
	const { openDialog } = useDialog();
	const [data, setData] = useState({
		data: [],
		total: 0,
		absoluteTotal: 0,
	});
	const [loading, setLoading] = useState(false);

	const filterFields = [
		{
			name: "keep_last_n_backups",
			label: "Keep Last N",
			type: "number" as const,
			matching: "equals" as const,
		},
		{
			name: "max_backup_age_in_days",
			label: "Max Age (Days)",
			type: "number" as const,
			matching: "equals" as const,
		},
		{
			name: "created_at",
			label: "Created Date",
			type: "date" as const,
			matching: "between" as const,
		},
		{
			name: "created_by",
			label: "Created By",
			type: "string" as const,
			matching: "contains" as const,
		},
	] as SearchField[];

	const columns = [
		{
			key: "keep_last_n_backups",
			label: "Keep Last N",
			orderable: true,
			format: (value) => (value ? `${value} backups` : "Unlimited"),
		},
		{
			key: "max_backup_age_in_days",
			label: "Max Age (Days)",
			orderable: true,
			format: (value) => (value ? `${value} days` : "Unlimited"),
		},
		{
			key: "created_by",
			label: "Created By",
			orderable: true,
			orderByKey: "created_by.name",
			format: (value) => value?.name ?? "—",
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
			id: "view",
			label: "View",
			icon: <EyeIcon />,
			onClick: (row) => {
				openDialog(BackupPolicyDialog, {
					defaultData: row,
					policyId: row.id,
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
				openDialog(BackupPolicyDialog, {
					defaultData: row,
					policyId: row.id,
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
					title: "Delete Backup Policy",
					description:
						"Are you sure you want to delete this backup policy? This action cannot be undone.",
					onConfirm: () => {
						deleteBackupPolicy(row.id);
					},
				});
			},
		},
	] as TableAction[];

	async function deleteBackupPolicy(policyId: string) {
		try {
			const response = await fetch(`/api/backup-policies/${policyId}`, {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
			});
			if (response.ok) {
				toast.success("Backup policy deleted successfully", {
					description: "The backup policy has been deleted.",
				});
				fetchData();
			} else {
				const error = await response.json();
				toast.error("Error deleting backup policy", {
					description: error.error || "Unknown error",
				});
			}
		} catch (error) {
			console.error(error);
			toast.error("Failed to delete backup policy", {
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
			const response = await fetch(`/api/backup-policies?${params}`, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
			});
			if (response.ok) {
				const result = await response.json();
				setData({
					...data,
					data: result.data,
					total: result.total,
					absoluteTotal: result.absoluteTotal,
				});
			} else {
				const error = await response.json();
				toast.error("Error fetching backup policies", {
					description: error.error || "Unknown error",
				});
			}
		} catch (error) {
			console.error(error);
			toast.error("Failed to fetch backup policies", {
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
				<h1 className="text-4xl font-black">Backup Policies</h1>
				<p className="text-muted-foreground text-sm">
					Manage your backup retention policies and cleanup rules.
				</p>
			</div>
			<div className="flex-col flex gap-4">
				<DataHeader filterFields={filterFields} name="backup-policies">
					<Button
						onClick={() => {
							openDialog(BackupPolicyDialog, {
								onConfirm: fetchData,
							});
						}}
					>
						<PlusIcon />
						New Policy
					</Button>
				</DataHeader>
				<Data
					showOrderBy
					actions={actions}
					columns={columns}
					data={data.data}
					loading={loading}
					name="backup-policies"
					absoluteTotal={data.absoluteTotal}
				/>
			</div>
		</div>
	);
}
