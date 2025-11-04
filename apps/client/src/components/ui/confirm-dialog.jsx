import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
} from "./card";
import { Button } from "./button";
import { AlertTriangle } from "lucide-react";

export function ConfirmDialog({
	isOpen,
	onClose,
	onConfirm,
	title,
	description,
	confirmText = "Confirm",
	cancelText = "Cancel",
	variant = "default",
}) {
	if (!isOpen) return null;

	const handleConfirm = () => {
		onConfirm();
		onClose();
	};

	const handleCancel = () => {
		onClose();
	};

	const handleBackdropClick = (e) => {
		if (e.target === e.currentTarget) {
			handleCancel();
		}
	};

	const handleKeyDown = (e) => {
		if (e.key === "Escape") {
			handleCancel();
		}
	};

	return (
		<div
			role="dialog"
			aria-modal="true"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
			onClick={handleBackdropClick}
			onKeyDown={handleKeyDown}
			tabIndex={-1}
		>
			<Card className="w-full max-w-md mx-4 shadow-xl">
				<CardHeader>
					<div className="flex items-center gap-3">
						<div className="flex-1">
							<CardTitle className="text-xl">{title}</CardTitle>
							{description && (
								<CardDescription className="mt-1.5">
									{description}
								</CardDescription>
							)}
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<div className="flex justify-end gap-3">
						<Button variant="outline" onClick={handleCancel}>
							{cancelText}
						</Button>
						<Button variant={variant} onClick={handleConfirm}>
							{confirmText}
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
