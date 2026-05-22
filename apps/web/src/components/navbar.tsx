import {
	DatabaseIcon,
	DesktopTowerIcon,
	HouseIcon,
	ListIcon,
	ScalesIcon,
	TimerIcon,
	UserIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "./ui/button";
import UserDropdown from "./user-dropdown";
import { useLocation, useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";

const NAV_ITEMS = [
	{ label: "Dashboard", path: "/dashboard", icon: <HouseIcon /> },
	{ label: "Backups", path: "/backups", icon: <DatabaseIcon /> },
	{ label: "Agents", path: "/agents", icon: <DesktopTowerIcon /> },
	{ label: "Jobs", path: "/backup-jobs", icon: <TimerIcon /> },
	{ label: "Policies", path: "/backup-policies", icon: <ScalesIcon /> },
	{ label: "Users", path: "/users", icon: <UserIcon /> },
];

export default function Navbar() {
	const navigate = useNavigate();
	const location = useLocation();
	const isMobile = useIsMobile();
	const [menuOpen, setMenuOpen] = useState(false);

	const handleNavClick = (path: string) => {
		navigate(path);
		setMenuOpen(false);
	};

	return (
		<nav className="w-full h-14 border-b bg-background sticky top-0 z-50 mb-2">
			<div className="h-full flex justify-between items-center">
				<div className="h-full flex">
					<div className="h-full flex items-center p-2 border-r">
						<img src="icon.png" alt="logo" className="h-full" />
					</div>
					{isMobile ? (
						<div className="h-full flex items-center px-2">
							<Button
								variant="ghost"
								size="icon"
								onClick={() => setMenuOpen((o) => !o)}
								aria-label="Toggle menu"
							>
								{menuOpen ? <XIcon size={20} /> : <ListIcon size={20} />}
							</Button>
						</div>
					) : (
						<div className="h-full flex items-center">
							{NAV_ITEMS.map((item) => (
								<div key={item.path} className="h-full flex items-center">
									<div
										className={`h-full flex items-center border-r gap-1 ${location.pathname.startsWith(item.path) ? "" : "text-muted-foreground"}`}
									>
										<Button
											variant="ghost"
											className="h-full px-4 rounded-none! m-0!"
											onClick={() => navigate(item.path)}
										>
											{item.icon}
											<span className="hidden sm:hidden md:block">
												{item.label}
											</span>
										</Button>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
				<div className="h-full p-2 border-l">
					<UserDropdown />
				</div>
			</div>

			{isMobile && menuOpen && (
				<div className="absolute top-14 left-0 w-full bg-background border-b shadow-md z-50">
					{NAV_ITEMS.map((item) => (
						<button
							key={item.path}
							className={`w-full flex items-center gap-3 px-4 py-3 text-sm border-b last:border-b-0 hover:bg-muted transition-colors ${location.pathname.startsWith(item.path) ? "font-medium" : "text-muted-foreground"}`}
							onClick={() => handleNavClick(item.path)}
						>
							{item.icon}
							{item.label}
						</button>
					))}
				</div>
			)}
		</nav>
	);
}
