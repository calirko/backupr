import { useIsMobile } from "@/hooks/use-mobile";
import { ArrowRight, X } from "lucide-react";
import { useState } from "react";
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
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "../ui/drawer";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export default function GoToPageDialog({
	open,
	onClose,
	onConfirm,
	min,
	max,
}: {
	open: boolean;
	onClose: (result: boolean) => void;
	onConfirm: (page: number) => void;
	min: number;
	max: number;
}): React.JSX.Element {
	const [page, setPage] = useState("");
	const [error, setError] = useState("");
	const isMobile = useIsMobile();

	function validate() {
		const pageNum = Number(page);

		if (!page) {
			setError("Número da página é obrigatório");
			return false;
		}

		if (isNaN(pageNum)) {
			setError("Número inválido");
			return false;
		}

		if (pageNum < min) {
			setError(`Página deve ser maior ou igual a ${min}`);
			return false;
		}

		if (pageNum > max) {
			setError(`Página deve ser menor ou igual a ${max}`);
			return false;
		}

		setError("");
		return true;
	}

	const content = (
		<div className="px-4 sm:px-0">
			<Label>Página</Label>
			<Input
				type="number"
				value={page}
				onChange={(e) => {
					setPage(e.target.value);
					setError("");
				}}
				placeholder={`Número entre ${min} e ${max}`}
				error={error}
				min={min}
				max={max}
			/>
		</div>
	);

	if (isMobile)
		return (
			<Drawer open={open} onOpenChange={onClose}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>Ir para Página</DrawerTitle>
						<DrawerDescription>
							Digite o número da página que deseja ir (entre {min} e {max}).
						</DrawerDescription>
					</DrawerHeader>
					{content}
					<DrawerFooter>
						<DialogClose asChild>
							<Button variant="outline">
								<X />
								Cancelar
							</Button>
						</DialogClose>
						<Button
							onClick={() => {
								if (!validate()) return;

								onConfirm(Number(page));
								onClose(false);
							}}
						>
							<ArrowRight />
							Ir
						</Button>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		);

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Ir para Página</DialogTitle>
					<DialogDescription>
						Digite o número da página que deseja ir (entre {min} e {max}).
					</DialogDescription>
				</DialogHeader>
				{content}
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline">
							<X />
							Cancelar
						</Button>
					</DialogClose>
					<Button
						onClick={() => {
							if (!validate()) return;

							onConfirm(Number(page));
							onClose(false);
						}}
					>
						<ArrowRight />
						Ir
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
