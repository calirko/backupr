import { Eye, EyeClosed } from "lucide-react";
import * as React from "react";
import { Button } from "./button";
import { Input } from "./input";

type InputPasswordProps = React.ComponentProps<typeof Input>;

export default function InputPassword(props: InputPasswordProps) {
	const [show, setShow] = React.useState(false);
	const inputRef = React.useRef<HTMLInputElement>(null);

	return (
		<div>
			<div className="relative flex gap-0">
				<Input
					{...{ ...props, error: undefined }}
					ref={inputRef}
					type={show ? "text" : "password"}
					className={`flex-1 rounded-r-none h-9 ${props?.error && "border-destructive"}`}
				/>
				<Button
					type="button"
					tabIndex={-1}
					aria-label={show ? "Hide password" : "Show password"}
					onClick={() => setShow((v) => !v)}
					variant={"ghost"}
					className={`h-9 rounded-l-none border-input bg-transparent dark:bg-input/30 border border-l-0 text-muted-foreground ${props?.error ? "border-destructive" : ""}`}
				>
					{!show ? <Eye /> : <EyeClosed />}
				</Button>
			</div>
			{props?.error && (
				<span className="text-xs text-destructive mt-1">{props.error}</span>
			)}
		</div>
	);
}
