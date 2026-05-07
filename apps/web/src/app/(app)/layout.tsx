import Navbar from "@/components/navbar";
import { DataProvider } from "@/hooks/use-data";
import { DialogProvider } from "@/hooks/use-dialog";
import { SocketProvider } from "@/hooks/use-socket";
import { Outlet } from "react-router-dom";

export default function AppLayout() {
	return (
		<div className="h-full flex flex-col">
			<Navbar />
			<DataProvider>
				<SocketProvider token={localStorage.getItem("token") || ""}>
					<DialogProvider>
						<Outlet />
					</DialogProvider>
				</SocketProvider>
			</DataProvider>
		</div>
	);
}
