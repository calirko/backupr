import { cn } from "@/lib/utils";
import { Button } from "./button";
import { useState } from "react";
import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";

function InputPassword({
	className,
	type,
	...props
}: React.ComponentProps<"input">) {
	const [showPassword, setShowPassword] = useState(false);

	return (
		<div className="flex">
			<input
				type={showPassword ? "text" : "password"}
				data-slot="input"
				className={cn(
					"dynround border-r-0! h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
					className,
				)}
				style={{
					borderTopRightRadius: "0px",
					borderBottomRightRadius: "0px",
				}}
				{...props}
			/>
			<Button
				type="button"
				onClick={() => setShowPassword((prev) => !prev)}
				className="m-0"
				variant={"outline"}
				style={{
					borderTopLeftRadius: "0px",
					borderBottomLeftRadius: "0px",
				}}
			>
				{!showPassword ? <EyeIcon /> : <EyeSlashIcon />}
			</Button>
		</div>
	);
}

export { InputPassword };
