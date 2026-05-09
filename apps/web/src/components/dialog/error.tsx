import { ClipboardIcon, XSquareIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

export default function ErrorDialog({
	open,
	onClose,
	title,
	description,
	message,
}: {
	open: boolean;
	onClose: () => void;
	title?: string;
	description?: string;
	message: string;
}): React.JSX.Element {
	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-destructive">
						{title ?? "Error"}
					</DialogTitle>
					{description && <DialogDescription>{description}</DialogDescription>}
				</DialogHeader>
				<pre className="dynround border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive whitespace-pre-wrap break-all">
					{message}
				</pre>
				<DialogFooter className="gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							navigator.clipboard.writeText(message);
							toast.success("Copied to clipboard");
						}}
					>
						<ClipboardIcon />
						Copy
					</Button>
					<DialogClose asChild>
						<Button size="sm" variant="outline">
							<XSquareIcon />
							Close
						</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
