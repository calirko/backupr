"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

interface GoToPageDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onGoToPage: (page: number) => void;
	maxPage: number;
}

export default function GoToPageDialog({
	open,
	onOpenChange,
	onGoToPage,
	maxPage,
}: GoToPageDialogProps) {
	const [page, setPage] = useState("");

	const handleSubmit = () => {
		const pageNumber = parseInt(page, 10);
		if (!isNaN(pageNumber) && pageNumber > 0 && pageNumber <= maxPage) {
			onGoToPage(pageNumber);
			onOpenChange(false);
			setPage("");
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Go to Page</DialogTitle>
					<DialogDescription>
						Enter a page number between 1 and {maxPage}
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div>
						<Label htmlFor="page">Page Number</Label>
						<Input
							id="page"
							type="number"
							min={1}
							max={maxPage}
							value={page}
							onChange={(e) => setPage(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									handleSubmit();
								}
							}}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSubmit}>Go</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
