import { PlusIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface AddTileProps {
	label: string;
	onClick: () => void;
	className?: string;
}

export function AddCard({ label, onClick, className }: AddTileProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"dynround border border-dashed border-foreground/25 flex flex-col items-center justify-center gap-2 min-h-40 text-muted-foreground hover:text-foreground hover:border-foreground/50 hover:bg-card/50 transition-colors",
				className,
			)}
		>
			<PlusIcon size={20} />
			<span className="text-sm font-medium">{label}</span>
		</button>
	);
}

export function AddRow({ label, onClick, className }: AddTileProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"dynround border border-dashed border-foreground/25 flex items-center justify-center gap-2 px-3 py-2.5 text-muted-foreground hover:text-foreground hover:border-foreground/50 hover:bg-card/50 transition-colors",
				className,
			)}
		>
			<PlusIcon size={16} />
			<span className="text-sm font-medium">{label}</span>
		</button>
	);
}
