import { Button } from "./ui/button";
import { Minus, X } from "lucide-react";

export function TitleBar() {
	const handleMinimize = () => {
		if (window.electron) {
			window.electron.minimizeWindow();
		}
	};

	const handleClose = () => {
		if (window.electron) {
			window.electron.closeWindow();
		}
	};

	return (
		<>
			<div className="w-full z-50">
				<div
					className="flex items-center justify-between h-8 bg-background border-b select-none"
					style={{ WebkitAppRegion: "drag" }}
				>
					<div className="flex items-center gap-2 px-3">
						<img src="logo.svg" alt="Backupr" className="h-4 w-4" />
						<span className="text-xs font-medium">Backupr</span>
					</div>

					<div className="flex" style={{ WebkitAppRegion: "no-drag" }}>
						<Button
							variant="ghost"
							size="sm"
							className="h-8 w-10 rounded-none hover:bg-accent"
							onClick={handleMinimize}
						>
							<Minus className="h-4 w-4" />
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="h-8 w-10 rounded-none hover:bg-destructive hover:text-destructive-foreground"
							onClick={handleClose}
						>
							<X className="h-4 w-4" />
						</Button>
					</div>
				</div>
			</div>
		</>
	);
}
