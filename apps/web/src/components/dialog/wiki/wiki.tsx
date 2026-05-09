import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "../../ui/dialog";

export default function WikiDialog({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}): React.JSX.Element {
	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Help & Manual</DialogTitle>
				</DialogHeader>
			</DialogContent>
		</Dialog>
	);
}
