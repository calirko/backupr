"use client";

import * as LabelPrimitive from "@radix-ui/react-label";
import * as React from "react";

import { cn } from "@/lib/utils";

interface LabelProps extends React.ComponentProps<typeof LabelPrimitive.Root> {
	required?: boolean;
}

function Label({ className, required, ...props }: LabelProps) {
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
					"mb-1.5 flex items-center gap-2 text-xs leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
					className,
				)}
				{...props}
			/>
		</div>
	);
}

export { Label };
