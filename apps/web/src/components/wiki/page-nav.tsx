import { ArrowRightIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { WikiLang } from "@/components/dialog/wiki/wiki";

interface PageNavProps {
	nextPage: { id: string; name: string } | null;
	onNext: () => void;
	lang: WikiLang;
}

export function PageNav({ nextPage, onNext, lang }: PageNavProps) {
	if (!nextPage) return null;

	const label = lang === "pt-br" ? "Próximo" : "Next";

	const handleClick = () => {
		document.getElementById("wiki-content")?.scrollTo({ top: 0, behavior: "smooth" });
		document.getElementById("wiki-sidebar")?.scrollTo({ top: 0, behavior: "smooth" });
		onNext();
	};

	return (
		<div className="mt-8 pt-4 border-t flex justify-end">
			<Button variant="outline" onClick={handleClick}>
				{label}: {nextPage.name}
				<ArrowRightIcon />
			</Button>
		</div>
	);
}
