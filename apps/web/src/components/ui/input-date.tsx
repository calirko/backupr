"use client";

import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "@phosphor-icons/react";
import { useState } from "react";

interface DatePickerProps {
	name?: string;
	defaultValue?: string;
	value?: string;
	onValueChange?: (value: Date | undefined) => void;
	size?: "sm" | "default" | "lg";
	disabled?: boolean;
	maxDate?: Date;
	unselectable?: boolean;
	readOnly?: boolean;
}

export default function InputDate({
	name,
	defaultValue,
	value,
	onValueChange,
	maxDate,
	disabled,
	readOnly,
	unselectable = true,
}: DatePickerProps) {
	// Determine if component is controlled
	const isControlled = value !== undefined;
	const [internalDate, setInternalDate] = useState<Date | undefined>(
		defaultValue ? new Date(defaultValue) : undefined,
	);

	const activeDate = isControlled
		? value
			? new Date(value)
			: undefined
		: internalDate;

	// Convert Date object to YYYY-MM-DD for the native input
	const dateString =
		activeDate instanceof Date && !isNaN(activeDate.getTime())
			? activeDate.toLocaleDateString("en-CA") // Format: YYYY-MM-DD
			: "";

	const handleDateChange = (newDate: Date | undefined) => {
		if (readOnly || disabled) return;
		if (maxDate && newDate && newDate > maxDate) return;
		if (!unselectable && !newDate) return;

		if (!isControlled) setInternalDate(newDate);
		onValueChange?.(newDate);
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const val = e.target.value;
		if (!val) {
			handleDateChange(undefined);
			return;
		}
		const newDate = new Date(val);
		if (!isNaN(newDate.getTime())) {
			handleDateChange(newDate);
		}
	};

	return (
		<Popover modal>
			<div className="relative flex w-full items-center">
				<PopoverTrigger asChild>
					<div
						className={cn(
							"dynround h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none flex items-center justify-between placeholder:text-muted-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80",
							disabled && "cursor-not-allowed opacity-50",
						)}
					>
						<input
							type="date"
							name={name}
							value={dateString}
							onChange={handleInputChange}
							readOnly={readOnly}
							disabled={disabled}
							max={maxDate?.toLocaleDateString("en-CA")}
							className="w-full bg-transparent outline-none text-base md:text-sm"
							onClick={(e) => e.stopPropagation()}
						/>
						<CalendarIcon className="h-4 w-4 opacity-50 shrink-0" />
					</div>
				</PopoverTrigger>
			</div>

			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					selected={activeDate}
					onSelect={handleDateChange}
					disabled={(date: Date) =>
						disabled || readOnly || (maxDate ? date > maxDate : false)
					}
					initialFocus
				/>
			</PopoverContent>
		</Popover>
	);
}
