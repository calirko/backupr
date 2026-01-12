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
						<DrawerTitle>Confirmar Ação</DrawerTitle>
						<DrawerDescription>
							Tem certeza de que quer realizar esta ação? Não será possível
							desfazê-la.
						</DrawerDescription>
					</DrawerHeader>
					<DrawerFooter>
						<DrawerClose asChild>
							<Button variant="outline">
								<X />
								Cancelar
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
								Confirmar
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
					<DialogTitle>Confirmar Ação</DialogTitle>
					<DialogDescription>
						Tem certeza de que quer realizar esta ação? Não será possível
						desfazê-la.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline">
							<X />
							Cancelar
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
							Confirmar
						</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
