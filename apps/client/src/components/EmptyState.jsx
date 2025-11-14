import { Plus, Upload } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

export function EmptyState({ onAddClick }) {
	return (
		<Card>
			<CardContent className="py-12 text-center">
				<Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
				<h3 className="text-lg font-semibold mb-2">No sync items configured</h3>
				<p className="text-muted-foreground mb-4">
					Add your first sync item to get started
				</p>
				<Button onClick={onAddClick}>
					<Plus className="mr-2 h-4 w-4" />
					Add Sync Item
				</Button>
			</CardContent>
		</Card>
	);
}
