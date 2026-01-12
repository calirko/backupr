import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useData } from "@/hooks/use-data";
import Api from "@/lib/api";
import Cookies from "js-cookie";
import { ChevronDown, File, Table } from "lucide-react";
import { toast } from "sonner";

export default function ExportData({
	disabled,
	endpoints,
	name,
	fileName,
}: {
	disabled: boolean;
	endpoints: { pdf: string; excel: string };
	name: string;
	fileName: string;
}) {
	const { filters, orderBy } = useData(name);

	async function downloadPDF() {
		const query = new URLSearchParams({
			filters: encodeURIComponent(JSON.stringify(filters)),
			orderBy: encodeURIComponent(JSON.stringify(orderBy)),
		});
		const url = `${endpoints.pdf}?${query.toString()}`;

		try {
			const response = await Api.get(url, {
				token: Cookies.get("token"),
				blob: true,
				headers: {
					"Content-Type": "application/pdf",
				},
			});
			const objURL = URL.createObjectURL(response as Blob);
			const a = document.createElement("a");
			a.href = objURL;
			a.download = `${fileName}_${new Date().toISOString()}.pdf`;
			a.click();
			URL.revokeObjectURL(objURL);
		} catch (error) {
			console.error(error);
			toast.error("Um erro ocorreu ao baixar o PDF");
		}
	}

	async function downloadExcel() {
		const query = new URLSearchParams({
			filters: encodeURIComponent(JSON.stringify(filters)),
			orderBy: encodeURIComponent(JSON.stringify(orderBy)),
		});
		const url = `${endpoints.excel}?${query.toString()}`;

		try {
			const response = await Api.get(url, {
				token: Cookies.get("token"),
				blob: true,
				headers: {
					"Content-Type": "application/xlsx",
				},
			});
			const objURL = URL.createObjectURL(response as Blob);
			const a = document.createElement("a");
			a.href = objURL;
			a.download = `${fileName}_${new Date().toISOString()}.xlsx`;
			a.click();
			URL.revokeObjectURL(objURL);
		} catch (error) {
			console.error(error);
			toast.error("Um erro ocorreu ao baixar o Excel");
		}
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<Button variant={"outline"} disabled={disabled} className="p-0">
					<div className="border-r h-full flex items-center px-2">
						<ChevronDown />
					</div>
					<span className="pr-2">Exportar</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="min-w-60">
				<DropdownMenuLabel>Exportar dados</DropdownMenuLabel>
				<DropdownMenuItem onClick={downloadPDF}>
					<File />
					PDF
				</DropdownMenuItem>
				<DropdownMenuItem onClick={downloadExcel}>
					<Table />
					Excel
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
