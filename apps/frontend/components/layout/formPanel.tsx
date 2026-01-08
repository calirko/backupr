import { cn } from "@/lib/utils";

export default function FormPanel({
	title,
	children,
	className,
}: {
	title?: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("border rounded-lg bg-background", className)}>
			{title && (
				<p className="font-semibold mb-4 border-b px-4 py-2">{title}</p>
			)}
			<div className="flex flex-col gap-4 p-4 pt-0">{children}</div>
		</div>
	);
}
