import * as React from "react";
import { Label as LabelPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Label({
	className,
	required,
	...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & { required?: boolean }) {
	return (
		<div className="flex items-center gap-1">
			<span
				className={cn(
					"text-destructive mb-1.5 flex items-center gap-2 text-xs leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
					!required && "hidden",
					className,
				)}
			>
				*
			</span>
			<LabelPrimitive.Root
				data-slot="label"
				className={cn(
					"flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
					className,
				)}
				{...props}
			/>
		</div>
	);
}

export { Label };
