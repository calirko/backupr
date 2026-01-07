"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmActionDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	title?: string;
	description?: string;
	confirmText?: string;
	cancelText?: string;
}

export default function ConfirmActionDialog({
	open,
	onOpenChange,
	onConfirm,
	title = "Confirm Action",
	description = "Are you sure you want to perform this action?",
	confirmText = "Confirm",
	cancelText = "Cancel",
}: ConfirmActionDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{cancelText}
					</Button>
					<Button
						variant="destructive"
						onClick={() => {
							onConfirm();
							onOpenChange(false);
						}}
					>
						{confirmText}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
