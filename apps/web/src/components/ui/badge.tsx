export default function Badge({
	children,
	variant,
}: {
	children: React.ReactNode;
	variant?: "default" | "success" | "error" | "warning" | "info";
}) {
	const variantClasses = {
		default: "text-gray-200",
		success: "text-green-200",
		error: "text-red-200",
		warning: "text-yellow-800",
		info: "text-blue-800",
	};

	return (
		<span
			className={`flex w-fit items-center text-xs font-medium ${variantClasses[variant || "default"]}`}
		>
			{children}
		</span>
	);
}
