import { Eye, FloppyDisk, Pencil, Plus, XSquare } from "@phosphor-icons/react";
import type { WikiLang } from "@/components/dialog/wiki/wiki";
import { PageNav } from "./page-nav";

interface Props {
	nextPage: { id: string; name: string } | null;
	onNext: () => void;
	lang: WikiLang;
}

const content = {
	en: {
		title: "Retention Policies",
		subtitle:
			"How to configure retention policies to manage backup storage automatically.",
		overviewTitle: "What is a retention policy?",
		overviewDesc:
			"A retention policy defines rules for automatically deleting old backups. Without a policy, backups accumulate indefinitely. You can limit storage by keeping only the most recent N backups, by removing backups older than a set number of days, or both at once.",
		rulesTitle: "The two rules",
		rules: [
			{
				name: "Keep Last N Backups",
				desc: "Sets a maximum count of backups to retain per job. Once the limit is reached, the oldest backup is removed each time a new one completes. Leave empty to keep all backups regardless of count.",
			},
			{
				name: "Max Backup Age (Days)",
				desc: "Any backup older than this many days is automatically removed. Leave empty for no age limit.",
			},
		],
		bothNote:
			"If both rules are set, the policy applies whichever condition results in more retention - i.e. a backup is only deleted when both rules agree it should be removed. At least one rule must be configured.",
		createTitle: "Creating a policy",
		createDesc:
			'Click "New Policy" on the Backup Policies page to open the creation dialog.',
		editTitle: "Editing a policy",
		editDesc:
			"Click the pencil icon on any policy row to update its rules. Changes apply to all jobs using that policy going forward.",
		viewTitle: "Viewing a policy",
		viewDesc:
			"Click the eye icon to inspect a policy's current settings in read-only mode.",
		deleteTitle: "Deleting a policy",
		deleteDesc:
			"Click the delete icon on a policy row. A confirmation dialog appears before permanent removal. Deleting a policy does not delete the backups already stored - it only removes the rule so future backups are no longer subject to automatic cleanup.",
		attachTitle: "Attaching a policy to a job",
		attachDesc:
			'When creating or editing a backup job, select a policy from the "Retention Policy" dropdown. The label shows both rules in compact form.',
		attachNone: 'Choose "No policy" to leave the job unmanaged.',
		attachLabel: "Keep last 10 · Max 30d",
	},
	"pt-br": {
		title: "Políticas de Retenção",
		subtitle:
			"Como configurar políticas de retenção para gerenciar o armazenamento de backups automaticamente.",
		overviewTitle: "O que é uma política de retenção?",
		overviewDesc:
			"Uma política de retenção define regras para excluir backups antigos automaticamente. Sem uma política, os backups se acumulam indefinidamente. Você pode limitar o armazenamento mantendo apenas os N backups mais recentes, removendo backups mais antigos que um número definido de dias, ou ambos ao mesmo tempo.",
		rulesTitle: "As duas regras",
		rules: [
			{
				name: "Manter Últimos N Backups",
				desc: "Define um limite máximo de backups a manter por job. Quando o limite é atingido, o backup mais antigo é removido cada vez que um novo é concluído. Deixe vazio para manter todos os backups independentemente da quantidade.",
			},
			{
				name: "Idade Máxima do Backup (Dias)",
				desc: "Qualquer backup mais antigo que este número de dias é removido automaticamente. Deixe vazio para sem limite de idade.",
			},
		],
		bothNote:
			"Se ambas as regras estiverem definidas, a política aplica a que resultar em mais retenção - ou seja, um backup só é excluído quando ambas as regras concordam com a remoção. Pelo menos uma regra deve ser configurada.",
		createTitle: "Criando uma política",
		createDesc:
			'Clique em "Nova Política" na página de Políticas de Backup para abrir o diálogo de criação.',
		editTitle: "Editando uma política",
		editDesc:
			"Clique no ícone de lápis em qualquer linha de política para atualizar suas regras. As alterações se aplicam a todos os jobs que usam essa política daqui em diante.",
		viewTitle: "Visualizando uma política",
		viewDesc:
			"Clique no ícone de olho para inspecionar as configurações atuais de uma política em modo somente leitura.",
		deleteTitle: "Excluindo uma política",
		deleteDesc:
			"Clique no ícone de exclusão em uma linha de política. Um diálogo de confirmação aparece antes da remoção permanente. Excluir uma política não exclui os backups já armazenados - apenas remove a regra para que futuros backups não estejam mais sujeitos à limpeza automática.",
		attachTitle: "Anexando uma política a um job",
		attachDesc:
			'Ao criar ou editar um job de backup, selecione uma política no menu suspenso "Política de Retenção". O rótulo mostra ambas as regras em forma compacta.',
		attachNone: 'Escolha "Sem política" para deixar o job sem gerenciamento.',
		attachLabel: "Manter últimos 10 · Máx 30d",
	},
};

function MockInput({
	label,
	placeholder,
	helper,
}: {
	label: string;
	placeholder: string;
	helper?: string;
}) {
	return (
		<div className="flex flex-col gap-1 w-full">
			<label className="text-xs font-medium">{label}</label>
			<div className="border rounded-md px-3 py-1.5 text-xs text-muted-foreground bg-background w-full">
				{placeholder}
			</div>
			{helper && (
				<p className="text-xs text-muted-foreground leading-snug">{helper}</p>
			)}
		</div>
	);
}

export function PoliciesPage({ nextPage, onNext, lang }: Props) {
	const c = content[lang];

	return (
		<div className="flex flex-col gap-5">
			<div>
				<h2 className="text-base font-semibold">{c.title}</h2>
				<p className="text-sm text-muted-foreground mt-1">{c.subtitle}</p>
			</div>

			<hr />

			<div>
				<h3 className="text-sm font-semibold">{c.overviewTitle}</h3>
				<p className="text-sm text-muted-foreground mt-1">{c.overviewDesc}</p>
			</div>

			<div>
				<h3 className="text-sm font-semibold">{c.rulesTitle}</h3>
				<div className="flex flex-col gap-2 mt-2">
					{c.rules.map((r) => (
						<p key={r.name} className="text-sm">
							<strong>{r.name}</strong>{" "}
							<span className="text-muted-foreground">- {r.desc}</span>
						</p>
					))}
				</div>
				<p className="text-sm text-muted-foreground mt-2">
					<em>{c.bothNote}</em>
				</p>
			</div>

			<hr />

			{/* Create */}
			<div className="flex flex-col gap-3">
				<div>
					<h3 className="text-sm font-semibold">{c.createTitle}</h3>
					<p className="text-sm text-muted-foreground mt-1">{c.createDesc}</p>
				</div>

				<div className="dynround w-full min-h-20 flex items-center justify-center">
					<button
						type="button"
						className="inline-flex items-center gap-1.5 rounded-md border bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 pointer-events-none"
					>
						<Plus size={13} weight="bold" />
						{lang === "en" ? "New Policy" : "Nova Política"}
					</button>
				</div>

				<div className="dynround w-full min-h-20 flex items-center justify-center">
					<div className="border rounded-lg bg-background shadow-sm p-4 w-72 flex flex-col gap-3">
						<div>
							<p className="text-xs font-semibold">
								{lang === "en"
									? "New Backup Policy"
									: "Nova Política de Backup"}
							</p>
							<p className="text-xs text-muted-foreground">
								{lang === "en"
									? "Create a new backup retention policy."
									: "Crie uma nova política de retenção de backup."}
							</p>
						</div>
						<MockInput
							label={
								lang === "en"
									? "Keep Last N Backups"
									: "Manter Últimos N Backups"
							}
							placeholder={lang === "en" ? "e.g., 10" : "ex.: 10"}
							helper={
								lang === "en"
									? "Leave empty to keep all backups."
									: "Deixe vazio para manter todos os backups."
							}
						/>
						<MockInput
							label={
								lang === "en"
									? "Max Backup Age (Days)"
									: "Idade Máxima do Backup (Dias)"
							}
							placeholder={lang === "en" ? "e.g., 30" : "ex.: 30"}
							helper={
								lang === "en"
									? "Leave empty for no age limit."
									: "Deixe vazio para sem limite de idade."
							}
						/>
						<div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground leading-snug">
							{lang === "en"
								? "You can set both rules. At least one rule must be configured."
								: "Você pode definir ambas as regras. Pelo menos uma deve ser configurada."}
						</div>
						<div className="flex justify-end gap-2 pt-1">
							<button
								type="button"
								className="inline-flex items-center gap-1.5 rounded-md border text-xs font-medium px-3 py-1.5 pointer-events-none"
							>
								<XSquare size={13} />
								{lang === "en" ? "Cancel" : "Cancelar"}
							</button>
							<button
								type="button"
								className="inline-flex items-center gap-1.5 rounded-md border bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 pointer-events-none"
							>
								<Plus size={13} weight="bold" />
								{lang === "en" ? "Create" : "Criar"}
							</button>
						</div>
					</div>
				</div>
			</div>

			<hr />

			{/* View / Edit / Delete row actions */}
			<div className="flex flex-col gap-3">
				<div>
					<h3 className="text-sm font-semibold">{c.viewTitle}</h3>
					<p className="text-sm text-muted-foreground mt-1">{c.viewDesc}</p>
				</div>
				<div>
					<h3 className="text-sm font-semibold">{c.editTitle}</h3>
					<p className="text-sm text-muted-foreground mt-1">{c.editDesc}</p>
				</div>

				{/* Edit dialog mockup */}
				<div className="dynround w-full min-h-20 flex items-center justify-center gap-3">
					<div className="flex flex-col gap-1.5">
						<button
							type="button"
							className="inline-flex items-center gap-1.5 rounded-md border text-xs font-medium px-3 py-1.5 pointer-events-none"
						>
							<Eye size={13} />
							{lang === "en" ? "View" : "Ver"}
						</button>
						<button
							type="button"
							className="inline-flex items-center gap-1.5 rounded-md border text-xs font-medium px-3 py-1.5 pointer-events-none"
						>
							<Pencil size={13} />
							{lang === "en" ? "Edit" : "Editar"}
						</button>
					</div>

					<div className="border rounded-lg bg-background shadow-sm p-4 w-64 flex flex-col gap-3">
						<p className="text-xs font-semibold">
							{lang === "en"
								? "Edit Backup Policy"
								: "Editar Política de Backup"}
						</p>
						<MockInput
							label={
								lang === "en"
									? "Keep Last N Backups"
									: "Manter Últimos N Backups"
							}
							placeholder="10"
						/>
						<MockInput
							label={
								lang === "en" ? "Max Backup Age (Days)" : "Idade Máxima (Dias)"
							}
							placeholder="30"
						/>
						<div className="flex justify-end gap-2">
							<button
								type="button"
								className="inline-flex items-center gap-1.5 rounded-md border text-xs font-medium px-3 py-1.5 pointer-events-none"
							>
								<XSquare size={13} />
								{lang === "en" ? "Cancel" : "Cancelar"}
							</button>
							<button
								type="button"
								className="inline-flex items-center gap-1.5 rounded-md border bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 pointer-events-none"
							>
								<FloppyDisk size={13} />
								{lang === "en" ? "Save" : "Salvar"}
							</button>
						</div>
					</div>
				</div>

				<div>
					<h3 className="text-sm font-semibold">{c.deleteTitle}</h3>
					<p className="text-sm text-muted-foreground mt-1">{c.deleteDesc}</p>
				</div>

				<div className="dynround w-full min-h-20 flex items-center justify-center">
					<button
						type="button"
						className="inline-flex items-center gap-1.5 rounded-md border border-destructive text-destructive text-xs font-medium px-3 py-1.5 pointer-events-none"
					>
						<XSquare size={13} />
						{lang === "en" ? "Delete" : "Excluir"}
					</button>
				</div>
			</div>

			<hr />

			{/* Attach to job */}
			<div className="flex flex-col gap-3">
				<div>
					<h3 className="text-sm font-semibold">{c.attachTitle}</h3>
					<p className="text-sm text-muted-foreground mt-1">{c.attachDesc}</p>
					<p className="text-sm text-muted-foreground mt-1">{c.attachNone}</p>
				</div>

				<div className="dynround w-full min-h-20 flex items-center justify-center">
					<div className="flex flex-col gap-1 w-56">
						<label className="text-xs font-medium">
							{lang === "en" ? "Retention Policy" : "Política de Retenção"}
						</label>
						<div className="border rounded-md px-3 py-1.5 text-xs bg-background flex items-center justify-between">
							<span>{c.attachLabel}</span>
							<span className="text-muted-foreground">▾</span>
						</div>
					</div>
				</div>
			</div>

			<PageNav nextPage={nextPage} onNext={onNext} lang={lang} />
		</div>
	);
}
