import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputDateProps
	extends React.InputHTMLAttributes<HTMLInputElement> {
	error?: string;
}

const InputDate = React.forwardRef<HTMLInputElement, InputDateProps>(
	({ className, error, ...props }, ref) => {
		return (
			<div className="w-full">
				<input
					type="date"
					className={cn(
						"flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
						error && "border-red-500",
						className,
					)}
					ref={ref}
					{...props}
				/>
				{error && <p className="text-red-500 text-sm mt-1">{error}</p>}
			</div>
		);
	},
);
InputDate.displayName = "InputDate";

export default InputDate;
