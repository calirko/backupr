// RootLayout.tsx
import { Outlet } from "react-router-dom";
import "../main.css";
import GridBackground from "@/components/grid-background";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function RootLayout() {
	return (
		<>
			<GridBackground />
			<div className="dark">
				<div className="h-dvh text-foreground relative z-10 ">
					<TooltipProvider>
						<Outlet />
					</TooltipProvider>
				</div>
				<Toaster />
			</div>
		</>
	);
}
