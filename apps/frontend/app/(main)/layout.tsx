import BreadcrumbHeader from "@/components/layout/breadcrumb";

export default async function MainLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<main
			className="w-full flex flex-col min-h-0 h-screen overflow-x-hidden"
			id="main-page-container"
		>
			<div className="flex justify-between border-b h-12 bg-background">
				<div className="h-12 flex items-center gap-4 flex-shrink-0">
					<BreadcrumbHeader />
				</div>
				<div></div>
			</div>
			<div className="p-2 pt-3 md:px-12 md:py-4 grow">{children}</div>
		</main>
	);
}
