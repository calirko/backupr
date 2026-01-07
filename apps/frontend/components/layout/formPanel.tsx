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
		<div className={cn("border rounded-lg p-4 bg-background", className)}>
			{title && (
				<h3 className="text-lg font-semibold mb-4 border-b pb-2">{title}</h3>
			)}
			<div className="flex flex-col gap-4">{children}</div>
		</div>
	);
}
