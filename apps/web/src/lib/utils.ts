import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sets a value in a nested object using dot notation
 * @param obj - The object to modify
 * @param path - The path as a string with dots (e.g., "test.com.dev")
 * @param value - The value to set
 */
export function setNestedValue(
	obj: Record<string, any>,
	path: string,
	value: any,
) {
	const keys = path.split(".");
	let current = obj;

	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i];
		if (!current[key] || typeof current[key] !== "object") {
			current[key] = {};
		}
		current = current[key];
	}

	current[keys[keys.length - 1]] = value;
}
