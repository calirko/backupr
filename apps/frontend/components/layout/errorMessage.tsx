import { AlertCircle } from "lucide-react";

export default function ErrorMessage({ message }: { message: string }) {
	return (
		<div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md text-yellow-800 dark:text-yellow-200 text-sm">
			<AlertCircle className="h-4 w-4 flex-shrink-0" />
			<span>{message}</span>
		</div>
	);
}
