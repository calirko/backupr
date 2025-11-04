import { useState } from "react";

export function useConfirm() {
	const [confirmState, setConfirmState] = useState({
		isOpen: false,
		title: "",
		description: "",
		confirmText: "Confirm",
		cancelText: "Cancel",
		variant: "default",
		onConfirm: () => {},
	});

	const confirm = ({
		title,
		description,
		confirmText = "Confirm",
		cancelText = "Cancel",
		variant = "default",
	}) => {
		return new Promise((resolve) => {
			setConfirmState({
				isOpen: true,
				title,
				description,
				confirmText,
				cancelText,
				variant,
				onConfirm: () => {
					resolve(true);
				},
			});
		});
	};

	const handleClose = () => {
		setConfirmState((prev) => ({
			...prev,
			isOpen: false,
		}));
	};

	const handleCancel = () => {
		handleClose();
	};

	return {
		confirm,
		confirmState,
		handleClose,
		handleCancel,
	};
}
