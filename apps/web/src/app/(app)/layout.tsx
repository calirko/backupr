import { Outlet } from "react-router-dom";
import Navbar from "@/components/navbar";
import { VersionBadge } from "@/components/version-badge";
import { DataProvider } from "@/hooks/use-data";
import { DialogProvider } from "@/hooks/use-dialog";
import { SocketProvider } from "@/hooks/use-socket";

export default function AppLayout() {
	return (
		<div className="h-fit flex flex-col pb-4">
			<Navbar />
			<DataProvider>
				<SocketProvider token={localStorage.getItem("token") || ""}>
					<DialogProvider>
						<Outlet />
					</DialogProvider>
				</SocketProvider>
			</DataProvider>
			<VersionBadge />
		</div>
	);
}
