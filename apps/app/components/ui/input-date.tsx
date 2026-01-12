"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

interface DatePickerProps {
	name?: string;
	defaultValue?: string;
	error?: string;
	onValueChange?: (value: Date | undefined) => void;
	value?: string;
	size?: "sm" | "default" | "lg";
	disabled?: boolean;
	maxDate?: Date;
	unselectable?: boolean;
	readOnly?: boolean;
}

export default function InputDate({
	name,
	defaultValue,
	error,
	onValueChange,
	value,
	maxDate,
	size,
	disabled,
	unselectable = true,
	readOnly = false,
}: DatePickerProps) {
	const isControlled = "value" in arguments[0];
	const [internalDate, setInternalDate] = useState<Date | undefined>(
		defaultValue ? new Date(defaultValue) : undefined,
	);
	const datePickerRef = useRef<HTMLInputElement>(null);

	const currentDate = isControlled
		? value
			? new Date(value)
			: undefined
		: internalDate;

	const [currentMonth, setCurrentMonth] = useState(currentDate || new Date());
	const [inputValue, setInputValue] = useState(
		currentDate ? currentDate.toISOString().split("T")[0] : "",
	);

	// Sync input and month when controlled value changes
	useEffect(() => {
		if (isControlled && value) {
			const date = new Date(value);
			setInputValue(date.toISOString().split("T")[0]);
			setCurrentMonth(date);
		} else if (value === "" && isControlled) {
			setInputValue("");
			setCurrentMonth(new Date());
		}
	}, [value, isControlled]);

	// Form reset handler
	useEffect(() => {
		const form = datePickerRef.current?.closest("form");
		const handleFormReset = () => {
			setInternalDate(undefined);
			setInputValue("");
		};

		if (form) {
			form.addEventListener("reset", handleFormReset);
			return () => form.removeEventListener("reset", handleFormReset);
		}
	}, []);

	const setDate = (newDate: Date | undefined) => {
		if (maxDate && newDate && newDate > new Date()) return;
		if (!unselectable && !newDate) return;

		if (newDate) setCurrentMonth(newDate);
		setInputValue(newDate ? newDate.toISOString().split("T")[0] : "");

		if (!isControlled) setInternalDate(newDate);
		onValueChange?.(newDate);
	};

	const handleInputChange = (inputDate: string) => {
		if (!inputDate) {
			setDate(undefined);
			return;
		}

		const valueWithTimezone = `${inputDate}T00:00:00${Intl.DateTimeFormat().resolvedOptions().timeZone ? "" : "Z"}`;
		const validDate = new Date(valueWithTimezone);

		if (!Number.isNaN(validDate.getTime())) {
			setDate(validDate);
		}
	};

	return (
		<Popover modal>
			<PopoverTrigger asChild disabled={disabled}>
				<div className="flex flex-col w-full bg-background">
					<Button
						type="button"
						size={size}
						variant={"outline"}
						className={cn(
							`bg-transparent dark:bg-input/30 justify-start gap-x-2 text-left font-normal ${error && "border-destructive"}`,
							!currentDate && "text-muted-foreground",
						)}
						disabled={disabled}
					>
						<input
							className="bg-transparent"
							type="date"
							max="2999-12-31"
							value={inputValue}
							readOnly={readOnly}
							onChange={(e) => setInputValue(e.target.value)}
							onBlur={(e) => handleInputChange(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									handleInputChange(inputValue);
								}
							}}
							onClick={(e) => e.stopPropagation()}
						/>
					</Button>
					{error && (
						<span className="text-xs text-destructive mt-1">{error}</span>
					)}
				</div>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0 z-50">
				<Calendar
					disabled={disabled || readOnly}
					captionLayout="dropdown"
					mode="single"
					selected={currentDate}
					onSelect={(e) => {
						setDate(e);
					}}
					defaultMonth={currentDate}
				/>
			</PopoverContent>
		</Popover>
	);
}
