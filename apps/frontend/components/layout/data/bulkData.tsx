import { useData } from "@/hooks/use-data";
import { RowDataActionsBulk, TableAction } from "./dataActions";
import { Button } from "@/components/ui/button";
import { Undo } from "lucide-react";

export default function BulkData({
	children,
	actions,
	total,
	disabled,
	name,
}: {
	children: React.ReactNode;
	actions: TableAction[];
	total: number;
	disabled?: boolean;
	name: string;
}) {
	const { selectedRows, setSelectedRows } = useData(name);

	if (selectedRows.length > 0) {
		return (
			<div className="flex gap-2 items-center">
				<RowDataActionsBulk actions={actions} disabled={disabled} name={name} />
				<Button
					disabled={disabled}
					variant={"outline"}
					onClick={() => setSelectedRows([])}
				>
					<Undo />
					Deselecionar
				</Button>
			</div>
		);
	} else return children;
}
