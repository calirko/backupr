import * as jwt_decode from "jwt-decode";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { getGravatarImageUrl } from "@/lib/gravatar";
import { SignOutIcon, UserIcon } from "@phosphor-icons/react";

export default function UserDropdown() {
	const [payload, setPayload] = useState({
		name: "",
		email: "",
		avatar: "",
	});

	useEffect(() => {
		const token = localStorage.getItem("token");
		if (token) {
			const decoded: any = jwt_decode.jwtDecode(token);
			const avatarUrl = getGravatarImageUrl(decoded.email);
			console.log(avatarUrl);
			setPayload({ ...decoded, avatar: avatarUrl });
		}
	}, []);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" className="h-full p-0">
					<div className="h-full aspect-square bg-card flex items-center justify-center">
						{payload.avatar ? (
							<img
								src={payload.avatar}
								alt={payload.name}
								className="h-full w-full object-cover"
							/>
						) : (
							<UserIcon />
						)}
					</div>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="left">
				<DropdownMenuGroup>
					<DropdownMenuLabel>My Account</DropdownMenuLabel>
					<DropdownMenuItem>Profile</DropdownMenuItem>
					<DropdownMenuItem>Billing</DropdownMenuItem>
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
	);
}
