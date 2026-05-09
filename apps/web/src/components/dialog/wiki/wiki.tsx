import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreatingAJobPage } from "@/components/wiki/creating-a-job";
import { HowItWorksPage } from "@/components/wiki/how-it-works";
import { InstallingAgentWindowsPage } from "@/components/wiki/installing-agent-windows";
import { IntroductionPage } from "@/components/wiki/introduction";
import { MakingBackupsPage } from "@/components/wiki/making-backups";
import { ManagingAgentsPage } from "@/components/wiki/managing-agents";
import { ManagingUsersPage } from "@/components/wiki/managing-users";
import { PoliciesPage } from "@/components/wiki/policies";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "../../ui/dialog";

export type WikiLang = "en" | "pt-br";

interface WikiPage {
	id: string;
	names: Record<WikiLang, string>;
	component: React.FC<{
		nextPage: { id: string; name: string } | null;
		onNext: () => void;
		lang: WikiLang;
	}>;
}

const pages: WikiPage[] = [
	{ id: "introduction", names: { en: "Introduction", "pt-br": "Introdução" }, component: IntroductionPage },
	{ id: "how-it-works", names: { en: "How It Works", "pt-br": "Como Funciona" }, component: HowItWorksPage },
	{ id: "managing-users", names: { en: "Managing Users", "pt-br": "Usuários" }, component: ManagingUsersPage },
	{ id: "policies", names: { en: "Policies", "pt-br": "Políticas" }, component: PoliciesPage },
	{ id: "managing-agents", names: { en: "Managing Agents", "pt-br": "Agentes" }, component: ManagingAgentsPage },
	{ id: "creating-a-job", names: { en: "Creating a Job", "pt-br": "Criando um Job" }, component: CreatingAJobPage },
	{ id: "making-backups", names: { en: "Making Backups", "pt-br": "Fazendo Backups" }, component: MakingBackupsPage },
];

export default function WikiDialog({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}): React.JSX.Element {
	const [activeId, setActiveId] = useState(pages[0].id);
	const [lang, setLang] = useState<WikiLang>("en");

	const activeIndex = pages.findIndex((p) => p.id === activeId);
	const activePage = pages[activeIndex];
	const nextPage =
		activeIndex < pages.length - 1 ? pages[activeIndex + 1] : null;
	const Page = activePage.component;
	const pageName = (p: WikiPage) => p.names[lang];

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent
				className="sm:max-w-4xl sm:max-h-[90vh] sm:min-h-140 overflow-hidden p-0 gap-0 flex flex-col"
				showCloseButton={false}
			>
				<div className="flex flex-1 min-h-0">
					{/* Sidebar */}
					<div className="flex flex-col gap-1 w-52 min-w-52 shrink-0 bg-muted/50 border-r p-3 overflow-y-auto">
						<DialogTitle className="pb-2">Help & Manual</DialogTitle>
						{pages.map((page) => (
							<Button
								key={page.id}
								type="button"
								onClick={() => setActiveId(page.id)}
								className={cn(
									"text-left justify-start w-full",
									activeId !== page.id && "text-muted-foreground",
								)}
								variant={activeId === page.id ? "outline" : "ghost"}
							>
								{pageName(page)}
							</Button>
						))}

						{/* Language toggle */}
						<div className="mt-auto pt-3 border-t flex gap-1">
							<Button
								size="sm"
								variant={lang === "en" ? "outline" : "ghost"}
								className="flex-1 text-xs"
								onClick={() => setLang("en")}
							>
								EN
							</Button>
							<Button
								size="sm"
								variant={lang === "pt-br" ? "outline" : "ghost"}
								className="flex-1 text-xs"
								onClick={() => setLang("pt-br")}
							>
								PT-BR
							</Button>
						</div>
					</div>

					{/* Content */}
					<div className="flex-1 min-h-0 p-4 overflow-y-auto">
						<Page
							nextPage={
								nextPage ? { id: nextPage.id, name: pageName(nextPage) } : null
							}
							onNext={() => nextPage && setActiveId(nextPage.id)}
							lang={lang}
						/>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
