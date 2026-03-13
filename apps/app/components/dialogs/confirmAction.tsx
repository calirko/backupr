import { useIsMobile } from "@/hooks/use-mobile";
import { Check, X } from "lucide-react";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "../ui/drawer";

export default function ConfirmActionDialog({
	open,
	onClose,
	onConfirm,
}: {
	open: boolean;
	onClose: (result: boolean) => void;
	onConfirm: () => void;
}): React.JSX.Element {
	const isMobile = useIsMobile();

	if (isMobile) {
		return (
			<Drawer open={open} onOpenChange={onClose}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>Confirm Action</DrawerTitle>
						<DrawerDescription>
							Are you sure you want to perform this action? This cannot be
							undone.
						</DrawerDescription>
					</DrawerHeader>
					<DrawerFooter>
						<DrawerClose asChild>
							<Button variant="outline">
								<X />
								Cancel
							</Button>
						</DrawerClose>
						<DrawerClose asChild>
							<Button
								variant="destructive"
								onClick={() => {
									onConfirm();
								}}
							>
								<Check />
								Confirm
							</Button>
						</DrawerClose>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Confirm Action</DialogTitle>
					<DialogDescription>
						Are you sure you want to perform this action? This cannot be undone.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline">
							<X />
							Cancel
						</Button>
					</DialogClose>
					<DialogClose asChild>
						<Button
							variant="destructive"
							onClick={() => {
								onConfirm();
							}}
						>
							<Check />
							Confirm
						</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
