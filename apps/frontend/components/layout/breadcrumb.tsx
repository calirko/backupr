"use client";

import { usePathname, useRouter } from "next/navigation";
import { Fragment } from "react";
import { routes } from "../routes";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbSeparator,
} from "../ui/breadcrumb";

// Import or define routes here

export default function BreadcrumbHeader() {
	const pathname = usePathname();
	const router = useRouter();

	// Flatten routes to create a lookup map
	const routeMap = new Map<string, string>();
	routes.forEach((section) => {
		section.children.forEach((route) => {
			routeMap.set(route.path, route.name);
		});
	});

	// Build breadcrumb segments
	const segments = pathname.split("/").filter(Boolean);
	const breadcrumbs: { name: string; path: string; isDynamic?: boolean }[] = [];

	// Always add "Início" as the first breadcrumb
	breadcrumbs.push({
		name: "Início",
		path: "/home",
	});

	let currentPath = "";
	segments.forEach((segment) => {
		currentPath += `/${segment}`;

		// Skip adding /home again since we already have "Início"
		if (currentPath === "/home") return;

		if (currentPath.endsWith("/sa") || currentPath.endsWith("/sa/")) return;

		// Check if this path exists in routes
		if (routeMap.has(currentPath)) {
			breadcrumbs.push({
				name: routeMap.get(currentPath)!,
				path: currentPath,
			});
		} else {
			// For paths not in routes (like dynamic segments), use the segment itself
			breadcrumbs.push({
				name: segment.charAt(0).toUpperCase() + segment.slice(1),
				path: currentPath,
				isDynamic: true,
			});
		}
	});

	return (
		<Breadcrumb>
			<BreadcrumbList>
				{breadcrumbs.map((crumb, index) => (
					<Fragment key={crumb.path}>
						<BreadcrumbItem
							onClick={() => {
								if (!crumb.isDynamic) router.push(crumb.path);
							}}
							className={
								crumb.isDynamic
									? "cursor-default text-muted-foreground"
									: "cursor-pointer"
							}
						>
							{crumb.name}
						</BreadcrumbItem>
						{index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
					</Fragment>
				))}
			</BreadcrumbList>
		</Breadcrumb>
	);
}
