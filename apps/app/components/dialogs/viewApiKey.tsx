import { Label } from "@radix-ui/react-dropdown-menu";
import { Clipboard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";

export default function ViewApiKeyDialog({
	apiKey,
	onClose,
	open,
}: {
	apiKey: string;
	open: boolean;
	onClose: () => void;
}) {
	return (
		<Dialog
			open={open}
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Client API Key</DialogTitle>
					<DialogDescription>
						Save this API key securely. You won't be able to see it again.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div>
						<Label>API Key</Label>
						<div className="flex items-center">
							<Input
								type="text"
								value={apiKey}
								readOnly
								className="font-mono text-sm grow"
							/>
							<Button
								size="sm"
								variant="outline"
								className="h-9 border-l-0"
								onClick={() => {
									navigator.clipboard.writeText(apiKey);
									toast.success("API key copied to clipboard");
								}}
							>
								<Clipboard />
								Copy
							</Button>
						</div>
					</div>
					<Button
						className="w-full"
						onClick={() => {
							onClose();
						}}
					>
						Done
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
