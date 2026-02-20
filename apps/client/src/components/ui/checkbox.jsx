import { useState } from "react";
import { Button } from "./button";

export default function Checkbox({ checked = false, onChange }) {
	const [isChecked, setIsChecked] = useState(checked);

	const handleToggle = () => {
		setIsChecked(!isChecked);
		onChange?.(!isChecked);
	};

	return (
		<Button
			onClick={handleToggle}
			className={`relative w-16 h-6 p-0 rounded ${
				isChecked ? "bg-background" : "bg-secondary"
			}`}
		>
			<div
				className={`absolute top-0.5 w-4 h-5 bg-white ${
					isChecked ? "translate-x-5" : "translate-x-0.5"
				}`}
			/>
		</Button>
	);
}
