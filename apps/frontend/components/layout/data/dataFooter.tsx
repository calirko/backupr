import GoToPageDialog from "@/components/dialogs/goToPage";
import { Input } from "@/components/ui/input";
import { useData } from "@/hooks/use-data";
import { useDialog } from "@/hooks/use-dialog";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../ui/button";
import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
} from "../../ui/pagination";

export default function DataFooter({
	total,
	loading,
	name,
}: {
	total: number;
	loading: boolean;
	name: string;
}) {
	const { skip, take, setTake, setSkip } = useData(name); // TODO take controls
	const buttonAmount = Math.ceil(total / take);
	const buttons = [];
	const { openDialog } = useDialog();
	const [isDesktop, setIsDesktop] = useState(false);

	useEffect(() => {
		const mediaQuery = window.matchMedia("(min-width: 768px)"); // Adjust the breakpoint as needed
		setIsDesktop(mediaQuery.matches);
		const handleResize = () => setIsDesktop(mediaQuery.matches);
		mediaQuery.addEventListener("change", handleResize);
		return () => mediaQuery.removeEventListener("change", handleResize);
	}, []);

	for (let i = 0; i < buttonAmount; i++) {
		if (buttonAmount > 3) {
			if (
				i === 0 || // Always show the first button
				i === buttonAmount - 1 || // Always show the last button
				i === skip / take || //|| // Show the currently selected button
				(isDesktop &&
					(i === skip / take - 1 || // Show one button before the selected button
						i === skip / take + 1)) // Show one button after the selected button
			) {
				const currentIndex = i - skip / take;

				buttons.push(
					<Button
						key={i}
						size="sm"
						disabled={loading}
						onClick={() => {
							if (i !== skip / take) setSkip(i * take);
							if (currentIndex === 0)
								openDialog(GoToPageDialog, {
									min: 1,
									max: buttonAmount,
									onConfirm: (page) => setSkip((page - 1) * take),
								});
						}}
						variant={currentIndex === 0 ? "default" : "ghost"}
						className={`p-1! aspect-square text-xs rounded-none ${i !== buttonAmount - 1 ? "border-r " : ""}`}
					>
						{i + 1}
					</Button>,
				);
			} else if (
				i === 1 &&
				skip > take // Show dots after the first button if needed
			) {
				buttons.push(
					<PaginationEllipsis className="h-8 border-r text-muted-foreground" />,
				);
			} else if (
				i === buttonAmount - 2 &&
				skip + take < total - 2 * take // Show dots before the last button if needed
			) {
				buttons.push(
					<PaginationEllipsis className="h-8 border-r text-muted-foreground" />,
				);
			}
		} else {
			// If there are less than 4 buttons, show all of them

			const currentIndex = i - skip / take;

			buttons.push(
				<Button
					key={i}
					disabled={loading}
					size="sm"
					onClick={() => setSkip(i * take)}
					variant={currentIndex === 0 ? "default" : "ghost"}
					className={`p-1! aspect-square rounded-none  ${i !== buttonAmount - 1 ? "border-r " : ""}`}
				>
					{i + 1}
				</Button>,
			);
		}
	}

	return (
		<div className="w-full">
			<div className="flex justify-between items-center flex-row md:flex-row gap-2">
				{buttonAmount === 0 && <div />}
				{buttonAmount > 0 && (
					<div>
						<Pagination>
							<PaginationContent>
								<Button
									className="p-1! aspect-square"
									variant={"ghost"}
									disabled={loading || skip === 0}
									onClick={() => setSkip(skip - take)}
								>
									<ChevronLeft />
								</Button>
								<div className="bg-sidebar flex rounded-md overflow-hidden items-center border">
									{buttons}
								</div>
								<Button
									className="p-1! aspect-square"
									variant={"ghost"}
									disabled={loading || skip + take >= total}
									onClick={() => setSkip(skip + take)}
								>
									<ChevronRight />
								</Button>
							</PaginationContent>
						</Pagination>
					</div>
				)}
				<div className="flex gap-2 items-center">
					{/** biome-ignore lint/correctness/useUniqueElementIds: <explanation> */}
					<Input
						id="take-value"
						type="number"
						className="w-20"
						min={1}
						max={500}
						defaultValue={take}
					/>
					<Button
						variant="outline"
						className="p-1! aspect-square"
						size={"sm"}
						onClick={() => {
							const inputValue = Number.parseInt(
								(document.getElementById("take-value") as HTMLInputElement)
									.value || "10",
								10,
							);
							setTake(inputValue);
						}}
					>
						<Check />
					</Button>
				</div>
			</div>
		</div>
	);
}
