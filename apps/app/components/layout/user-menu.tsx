"use client";

import * as React from "react";
import { LogOut, User } from "lucide-react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";

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
		const hash = email
			.trim()
			.toLowerCase()
			.split("")
			.reduce((acc, char) => {
				return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
			}, 0);
		// Simple hash for demo - in production use MD5
		return `https://www.gravatar.com/avatar/${Math.abs(hash)}?d=mp&s=32`;
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" className="relative h-8 w-8 rounded-full">
					{email ? (
						<img
							src={getGravatarUrl(email)}
							alt={name || email}
							className="h-8 w-8 rounded-full"
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
					<LogOut className="mr-2 h-4 w-4" />
					<span>Log out</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
