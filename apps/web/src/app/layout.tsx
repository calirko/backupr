// RootLayout.tsx
import { Outlet } from "react-router-dom";
import "../main.css";
import { CheckSquareIcon, InfoIcon, XSquareIcon } from "@phosphor-icons/react";
import { WarningIcon } from "@phosphor-icons/react/dist/ssr";
import GridBackground from "@/components/grid-background";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function RootLayout() {
	return (
		<>
			<GridBackground />
			<div className="h-dvh dark text-foreground relative z-10 ">
				<TooltipProvider>
					<Outlet />
					<Toaster
						position="bottom-center"
						expand
						icons={{
							warning: <WarningIcon className="text-orange-200" />,
							error: <XSquareIcon className="text-destructive" />,
							success: <CheckSquareIcon style={{ color: "var(--greenish)" }} />,
							info: <InfoIcon />,
						}}
					/>
				</TooltipProvider>
			</div>
		</>
	);
}
