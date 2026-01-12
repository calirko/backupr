"use client";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import crypto from "crypto";
import Cookies from "js-cookie";
import { LogOut, User } from "lucide-react";
import { useRouter } from "next/navigation";

interface UserMenuProps {
	email?: string;
	name?: string;
}

export function UserMenu({ email, name }: UserMenuProps) {
	const router = useRouter();

	const handleLogout = () => {
		Cookies.remove("token");
		router.push("/auth/signin");
	};

	// Generate Gravatar URL
	const getGravatarUrl = (email: string) => {
		const trimmedEmail = email.trim().toLowerCase();
		const hash = crypto.createHash("sha256").update(trimmedEmail).digest("hex");
		return `https://www.gravatar.com/avatar/${hash}?d=mp&s=32`;
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					className="relative aspect-square h-full border-l p-0"
				>
					{email ? (
						<img
							src={getGravatarUrl(email)}
							alt={name || email}
							className="h-full aspect-square object-cover p-2"
							onError={(e) => {
								// Fallback to icon on error
								const target = e.target as HTMLImageElement;
								target.style.display = "none";
								if (target.nextElementSibling) {
									(target.nextElementSibling as HTMLElement).style.display =
										"flex";
								}
							}}
						/>
					) : null}
					<div
						className="h-8 w-8 rounded-full bg-muted flex items-center justify-center"
						style={{ display: email ? "none" : "flex" }}
					>
						<User className="h-4 w-4" />
					</div>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuLabel>
					<div className="flex flex-col space-y-1">
						<p className="text-sm font-medium leading-none">{name || "User"}</p>
						{email && (
							<p className="text-xs leading-none text-muted-foreground">
								{email}
							</p>
						)}
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={handleLogout}>
					<LogOut className="w-4 h-4" />
					<span>Log out</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
