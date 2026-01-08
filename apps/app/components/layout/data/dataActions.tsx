import ConfirmActionDialog from "@/components/dialogs/confirmAction";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useData } from "@/hooks/use-data";
import { useDialog } from "@/hooks/use-dialog";
import { ChevronDown, Ellipsis } from "lucide-react";
import { useRouter } from "next/navigation";

export type TableAction =
	| {
			id: string;
			label: string;
			icon: React.ReactNode;
			variant?: "default" | "destructive";
			requireConfirmation?: boolean;
			onClick: (row: any) => void;
			onBulkClick?: (rows: any[]) => void;
			disabled?: (row: any) => boolean;
	  }
	| {
			id: string;
			label: string;
			icon: React.ReactNode;
			variant?: "default" | "destructive";
			href: (row: any) => string;
			disabled?: (row: any) => boolean;
	  }
	| {
			divider: true;
			id: string;
	  }
	| {
			label: string;
			id: string;
	  };

function functionExecute({
	action,
	row,
	router,
	openDialog,
}: {
	action: TableAction;
	row: any;
	router: ReturnType<typeof useRouter>;
	openDialog: ReturnType<typeof useDialog>["openDialog"];
}) {
	if ("divider" in action) {
		return;
	}
	if ("label" in action && !("href" in action) && !("onClick" in action)) {
		return;
	}
	if ("href" in action) {
		router.push(action.href(row));
	} else if (action.onClick) {
		if (action.requireConfirmation) {
			openDialog(ConfirmActionDialog, {
				onConfirm: () => action.onClick(row),
			});
		} else {
			action.onClick(row);
		}
	}
}

function bulkFunctionExecute({
	action,
	rows,
	router,
	openDialog,
	onFinish,
}: {
	action: TableAction;
	rows: any[];
	router: ReturnType<typeof useRouter>;
	openDialog: ReturnType<typeof useDialog>["openDialog"];
	onFinish: () => void;
}) {
	if ("divider" in action) {
		return;
	}
	if ("label" in action && !("href" in action) && !("onBulkClick" in action)) {
		return;
	}
	if ("href" in action) {
		router.push(action.href(rows));
	} else if (action.onBulkClick) {
		if (action.requireConfirmation) {
			openDialog(ConfirmActionDialog, {
				onConfirm: () => {
					action?.onBulkClick?.(rows);
					onFinish();
				},
			});
		} else {
			action.onBulkClick(rows);
			onFinish();
		}
	}
}

export function RowActionsWrapper({
	children,
	actions,
	row,
}: {
	children: React.ReactNode;
	actions: TableAction[];
	row: any;
}) {
	const { openDialog } = useDialog();
	const router = useRouter();

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				{actions.map((action) => {
					if ("divider" in action) {
						return <ContextMenuSeparator key={action.id} />;
					}
					if (
						"label" in action &&
						!("href" in action) &&
						!("onClick" in action)
					) {
						return (
							<ContextMenuLabel key={action.id}>
								{action.label}
							</ContextMenuLabel>
						);
					}
					return (
						<ContextMenuItem
							disabled={action.disabled?.(row)}
							key={action.id}
							onClick={() => {
								functionExecute({ action, row, router, openDialog });
							}}
							variant={action.variant}
						>
							{action.icon}
							{action.label}
						</ContextMenuItem>
					);
				})}
			</ContextMenuContent>
		</ContextMenu>
	);
}

export function RowDataActions({
	actions,
	row,
}: {
	actions: TableAction[];
	row: any;
}) {
	const { openDialog } = useDialog();
	const router = useRouter();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					className="p-0! h-8 w-8 rounded-none"
					variant={"ghost"}
					size="sm"
				>
					<Ellipsis size={18} />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="left">
				{actions.map((action) => {
					if ("divider" in action) {
						return <DropdownMenuSeparator key={action.id} />;
					}
					if (
						"label" in action &&
						!("href" in action) &&
						!("onClick" in action)
					) {
						return (
							<DropdownMenuLabel key={action.id}>
								{action.label}
							</DropdownMenuLabel>
						);
					}
					return (
						<DropdownMenuItem
							key={action.id}
							disabled={action.disabled?.(row)}
							onClick={() => {
								functionExecute({ action, row, router, openDialog });
							}}
							variant={action.variant}
						>
							{action.icon}
							{action.label}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function RowDataActionsBulk({
	actions,
	disabled,
	name,
}: {
	actions: TableAction[];
	disabled?: boolean;
	name: string;
}) {
	const { openDialog } = useDialog();
	const router = useRouter();
	const { selectedRows, setSelectedRows } = useData(name);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button disabled={disabled}>
					<ChevronDown />
					{selectedRows.length} Selecionado{selectedRows.length > 1 ? "s" : ""}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent>
				{actions
					.filter((action) => "onBulkClick" in action)
					.map((action) => {
						if ("divider" in action) {
							return <DropdownMenuSeparator key={action.id} />;
						}
						if (
							"label" in action &&
							!("href" in action) &&
							!("onBulkClick" in action)
						) {
							return (
								<DropdownMenuLabel key={action.id}>
									{action.label}
								</DropdownMenuLabel>
							);
						}

						return (
							<DropdownMenuItem
								key={action.id}
								onClick={() => {
									bulkFunctionExecute({
										action,
										rows: selectedRows,
										router,
										openDialog,
										onFinish: () => {
											setSelectedRows([]);
										},
									});
								}}
								variant={action.variant}
							>
								{action.icon}
								{action.label}
							</DropdownMenuItem>
						);
					})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
