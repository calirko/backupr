import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputCurrencyProps
	extends React.InputHTMLAttributes<HTMLInputElement> {
	error?: string;
}

const InputCurrency = React.forwardRef<HTMLInputElement, InputCurrencyProps>(
	({ className, error, ...props }, ref) => {
		const formatCurrency = (value: string) => {
			// Remove all non-numeric characters
			const numericValue = value.replace(/[^0-9]/g, "");
			
			if (!numericValue) return "";
			
			// Convert to number and format
			const number = parseInt(numericValue, 10) / 100;
			return new Intl.NumberFormat("en-US", {
				style: "currency",
				currency: "USD",
			}).format(number);
		};

		const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
			const formatted = formatCurrency(e.target.value);
			e.target.value = formatted;
			props.onChange?.(e);
		};

		return (
			<div className="w-full">
				<input
					type="text"
					className={cn(
						"flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
						error && "border-red-500",
						className,
					)}
					ref={ref}
					{...props}
					onChange={handleChange}
				/>
				{error && <p className="text-red-500 text-sm mt-1">{error}</p>}
			</div>
		);
	},
);
InputCurrency.displayName = "InputCurrency";

export default InputCurrency;
