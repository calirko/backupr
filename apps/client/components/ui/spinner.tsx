import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				"animate-spin rounded-full border-2 border-current border-t-transparent h-4 w-4",
				className,
			)}
		/>
	);
}
