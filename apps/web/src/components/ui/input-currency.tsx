import { useMemo, useRef, useState } from "react";
import { Input } from "./input";

type InputCurrencyProps = Omit<
	React.ComponentProps<typeof Input>,
	"type" | "value" | "onChange"
> & {
	value?: string; // Should be a decimal string like "3.40"
	onChange?: (value: string) => void; // Returns a decimal string like "3.40"
};

const formatCurrency = (val: string): string => {
	if (val === "" || val === "0") {
		return "R$ 0,00";
	}

	// val is expected to be a decimal string like "3.40"
	const numValue = parseFloat(val);
	if (Number.isNaN(numValue)) {
		return "R$ 0,00";
	}

	return `R$ ${numValue
		.toFixed(2)
		.replace(".", ",")
		.replace(/(\d)(?=(\d{3})+\,)/g, "$1.")}`;
};

export default function InputCurrency({
	value = "0",
	onChange,
	...props
}: InputCurrencyProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [isInCentsMode, setIsInCentsMode] = useState(false);
	const [centsValue, setCentsValue] = useState("");

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const rawValue = e.target.value.replace(/[^0-9]/g, "");

		if (isInCentsMode) {
			// In cents mode, we're typing the decimal part
			if (centsValue.length < 2) {
				const newCentsValue = centsValue + rawValue.slice(-1);
				setCentsValue(newCentsValue);

				if (newCentsValue.length === 2) {
					// Finished typing cents, combine with the integer part
					const integerPart = Math.floor(parseFloat(value || "0"));
					const finalValue = `${integerPart}.${newCentsValue}`;
					onChange?.(finalValue);
					setIsInCentsMode(false);
					setCentsValue("");
				}
			}
		} else {
			// Convert cents input to decimal format
			const numericValue = parseInt(rawValue || "0", 10);
			const decimalValue = (numericValue / 100).toFixed(2);
			onChange?.(decimalValue);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "," || e.key === ".") {
			e.preventDefault();
			// Switch to cents mode
			setIsInCentsMode(true);
			setCentsValue("");
		} else if (e.key === "Backspace" && isInCentsMode) {
			e.preventDefault();
			if (centsValue.length > 0) {
				setCentsValue(centsValue.slice(0, -1));
			} else {
				// Exit cents mode and go back to editing the integer part
				setIsInCentsMode(false);
			}
		}
	};

	const displayValue = useMemo(() => {
		if (isInCentsMode) {
			// Show the current value with the cents being typed
			const numValue = parseFloat(value || "0");
			const integerPart = Math.floor(numValue);
			const formattedInteger = `R$ ${integerPart
				.toFixed(2)
				.replace(".", ",")
				.replace(/(\d)(?=(\d{3})+\,)/g, "$1.")}`;

			// Replace the cents part with what's being typed
			const parts = formattedInteger.split(",");
			const newCents = centsValue.padEnd(2, "_");
			return `${parts[0]},${newCents}`;
		}
		return formatCurrency(value);
	}, [value, isInCentsMode, centsValue]);

	return (
		<div>
			<div className="relative">
				<Input
					{...{ ...props, error: undefined }}
					ref={inputRef}
					type="text"
					value={displayValue}
					onChange={handleChange}
					onKeyDown={handleKeyDown}
					className={`pl-3`}
				/>
			</div>
		</div>
	);
}
