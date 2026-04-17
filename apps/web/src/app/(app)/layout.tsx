import Navbar from "@/components/navbar";
import { DataProvider } from "@/hooks/use-data";
import { DialogProvider } from "@/hooks/use-dialog";
import { Outlet } from "react-router-dom";

export default function AppLayout() {
	return (
		<div>
			<Navbar />
			<DataProvider>
				<DialogProvider>
					<Outlet />
				</DialogProvider>
			</DataProvider>
		</div>
	);
}
