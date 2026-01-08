import { capitalizeFirstLetter } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export default function RelativeDate({ date }: { date: Date }) {
	// Get the browser's language
	const locale =
		typeof navigator !== "undefined" ? navigator.language : "en-US";

	// Use Intl.RelativeTimeFormat for localized relative time
	const rtf = new Intl.RelativeTimeFormat(locale, {
		numeric: "auto",
		style: "long",
	});

	const now = new Date();
	const diff = now.getTime() - date.getTime();

	// Convert to seconds
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const months = Math.floor(days / 30.44); // More accurate month calculation
	const years = Math.floor(days / 365.25); // More accurate year calculation

	let response;

	// Return the appropriate relative time
	if (Math.abs(years) > 0) {
		response = rtf.format(-years, "year");
	} else if (Math.abs(months) > 0) {
		response = rtf.format(-months, "month");
	} else if (Math.abs(days) > 0) {
		response = rtf.format(-days, "day");
	} else if (Math.abs(hours) > 0) {
		response = rtf.format(-hours, "hour");
	} else if (Math.abs(minutes) > 0) {
		response = rtf.format(-minutes, "minute");
	} else {
		response = rtf.format(-seconds, "second");
	}

	return (
		<Tooltip>
			<TooltipTrigger>
				{capitalizeFirstLetter(response.toString())}
			</TooltipTrigger>
			<TooltipContent>{date.toLocaleString()}</TooltipContent>
		</Tooltip>
	);
}
