import type { ReactNode } from "react";

interface StatusBadgeProps {
	icon: ReactNode;
	label: string;
	variant?: "neutral" | "success" | "destructive" | "warning";
}

export default function StatusBadge({
	icon,
	label,
	variant = "neutral",
}: StatusBadgeProps) {
	const variantClasses = {
		neutral: "text-muted-foreground",
		success: "text-success",
		destructive: "text-destructive",
		warning: "text-warning",
	};

	return (
		<span className={`flex gap-1.5 items-center ${variantClasses[variant]}`}>
			{icon}
			{label}
		</span>
	);
}
