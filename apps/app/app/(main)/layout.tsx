"use client";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { Token } from "@/lib/token";
import { cn } from "@/lib/utils";
import Cookies from "js-cookie";
import { Building2, Database, FileText, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function MainLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const pathname = usePathname();
	const [user, setUser] = useState<{ email: string; name: string } | null>(
		null,
	);

	useEffect(() => {
		const token = Cookies.get("token");
		if (token) {
			const payload = Token.payload(token);
			if (payload) {
				setUser({ email: payload.email, name: payload.name });
			}
		}
	}, []);

	const navItems = [
		{ href: "/backups", icon: Database, label: "Backups" },
		{ href: "/logs", icon: FileText, label: "Logs" },
		{ href: "/users", icon: Users, label: "Users" },
		{ href: "/clients", icon: Building2, label: "Clients" },
	];

	return (
		<main
			className="w-full flex flex-col min-h-0 h-screen overflow-x-hidden"
			id="main-page-container"
		>
			<div className="flex justify-between border-b h-12 bg-background">
				<div className="flex">
					<div className="h-full border-r">
						<img src={"/logo.svg"} className="h-full p-2" />
					</div>
					<div className="h-12 flex items-center shrink-0">
						{navItems.map((item) => (
							<Link key={item.href} href={item.href} className="h-full">
								<Button
									variant={"ghost"}
									size="sm"
									className={cn(
										"gap-2 border-r h-full",

										!pathname.startsWith(item.href) && "text-muted-foreground",
									)}
								>
									<span className="px-2 flex items-center gap-2">
										<item.icon className="h-4 w-4" />
										{item.label}
									</span>
								</Button>
							</Link>
						))}
					</div>
				</div>
				<div className="flex items-center">
					<ThemeToggle />
					<UserMenu email={user?.email} name={user?.name} />
				</div>
			</div>
			<div className="p-2 pt-3 md:px-12 md:py-4 grow">{children}</div>
		</main>
	);
}
