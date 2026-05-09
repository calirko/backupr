import { jwtDecode } from "jwt-decode";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { getGravatarImageUrl } from "@/lib/gravatar";
import {
	BookOpenIcon,
	GearIcon,
	SignOutIcon,
	UserIcon,
} from "@phosphor-icons/react";
import SettingsDialog from "./dialog/settings/settings";
import WikiDialog from "./dialog/wiki/wiki";

export default function UserDropdown() {
	const [payload, setPayload] = useState({
		name: "",
		email: "",
		avatar: "",
	});
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [wikiOpen, setWikiOpen] = useState(false);

	useEffect(() => {
		const token = localStorage.getItem("token");
		if (token) {
			const decoded: any = jwtDecode(token);
			const avatarUrl = getGravatarImageUrl(decoded.user?.email);
			setPayload({
				name: decoded.user?.name || "",
				email: decoded.user?.email || "",
				avatar: avatarUrl || "",
			});
		}
	}, []);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" className="h-full p-0">
						<div className="dynround h-full aspect-square bg-card flex items-center justify-center">
							{payload.avatar ? (
								<img
									src={payload.avatar}
									alt={payload.name}
									className="h-full w-full object-cover dynround"
									onError={() => {
										setPayload({
											name: payload.name,
											email: payload.email,
											avatar: "",
										});
									}}
								/>
							) : (
								<UserIcon />
							)}
						</div>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent side="left">
					<div className="flex items-center gap-2.5 px-2 py-1.5">
						<div className="size-8 dynround bg-muted flex items-center justify-center shrink-0 overflow-hidden">
							{payload.avatar ? (
								<img
									src={payload.avatar}
									alt={payload.name}
									className="h-full w-full object-cover"
								/>
							) : (
								<UserIcon className="size-4" />
							)}
						</div>
						<div className="flex flex-col min-w-0">
							<span className="text-sm font-medium leading-none truncate">
								{payload.name}
							</span>
							<span className="text-xs text-muted-foreground truncate mt-0.5">
								{payload.email}
							</span>
						</div>
					</div>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuItem onSelect={() => setWikiOpen(true)}>
							<BookOpenIcon />
							Help & Manual
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
							<GearIcon />
							Settings
						</DropdownMenuItem>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuItem
							variant="destructive"
							onClick={() => {
								localStorage.removeItem("token");
								window.location.reload();
							}}
						>
							<SignOutIcon />
							Logout
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			<SettingsDialog
				open={settingsOpen}
				onClose={() => setSettingsOpen(false)}
			/>
			<WikiDialog open={wikiOpen} onClose={() => setWikiOpen(false)} />
		</>
	);
}
