import { useState } from "react";
import { Button } from "./button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "./card";
import { ConfirmDialog } from "./confirm-dialog";
import { useConfirm } from "./use-confirm";

export function ConfirmDialogDemo() {
	const { confirm, confirmState, handleClose } = useConfirm();
	const [lastResult, setLastResult] = useState(null);

	const handleDefaultConfirm = async () => {
		const result = await confirm({
			title: "Continue Action",
			description: "Are you sure you want to continue with this action?",
			confirmText: "Continue",
			cancelText: "Cancel",
		});
		setLastResult(result ? "Confirmed" : "Cancelled");
	};

	const handleDestructiveConfirm = async () => {
		const result = await confirm({
			title: "Delete Item",
			description:
				"Are you sure you want to delete this item? This action cannot be undone.",
			confirmText: "Delete",
			cancelText: "Cancel",
			variant: "destructive",
		});
		setLastResult(result ? "Deleted" : "Cancelled");
	};

	const handleSimpleConfirm = async () => {
		const result = await confirm({
			title: "Simple Confirmation",
		});
		setLastResult(result ? "Confirmed" : "Cancelled");
	};

	return (
		<div className="p-8 space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Confirm Dialog Demo</CardTitle>
					<CardDescription>
						Test the custom confirmation dialog component
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex flex-wrap gap-3">
						<Button onClick={handleDefaultConfirm}>Show Default Confirm</Button>
						<Button onClick={handleDestructiveConfirm} variant="destructive">
							Show Destructive Confirm
						</Button>
						<Button onClick={handleSimpleConfirm} variant="outline">
							Show Simple Confirm
						</Button>
					</div>

					{lastResult && (
						<div className="mt-4 p-4 bg-secondary rounded-md">
							<p className="text-sm font-medium">Last Result: {lastResult}</p>
						</div>
					)}
				</CardContent>
			</Card>

			<ConfirmDialog
				isOpen={confirmState.isOpen}
				onClose={handleClose}
				onConfirm={confirmState.onConfirm}
				title={confirmState.title}
				description={confirmState.description}
				confirmText={confirmState.confirmText}
				cancelText={confirmState.cancelText}
				variant={confirmState.variant}
			/>
		</div>
	);
}
