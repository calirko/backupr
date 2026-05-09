import type { WikiLang } from "@/components/dialog/wiki/wiki";
import { PageNav } from "./page-nav";

interface Props {
	nextPage: { id: string; name: string } | null;
	onNext: () => void;
	lang: WikiLang;
}

export function InstallingAgentWindowsPage({ nextPage, onNext, lang }: Props) {
	return (
		<div className="flex flex-col gap-4">
			<div>
				<h2 className="text-base font-semibold">Installing the Agent on Windows</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Step-by-step guide to installing and pairing the agent on a Windows machine.
				</p>
			</div>

			<PageNav nextPage={nextPage} onNext={onNext} lang={lang} />
		</div>
	);
}
