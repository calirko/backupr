import type { WikiLang } from "@/components/dialog/wiki/wiki";
import {
	Copy,
	Eye,
	Pencil,
	Plus,
	TestTube,
	XSquare,
} from "@phosphor-icons/react";
import { PageNav } from "./page-nav";

interface Props {
	nextPage: { id: string; name: string } | null;
	onNext: () => void;
	lang: WikiLang;
}

const content = {
	en: {
		title: "Creating a Backup Job",
		subtitle:
			"How to define a backup job with a schedule, files, and settings.",
		overviewTitle: "What is a backup job?",
		overviewDesc:
			"A backup job defines what to back up, when, and how. Each job targets a specific agent and runs on a cron schedule. When triggered, the agent compresses the listed paths into a 7z archive and uploads it to the server.",
		createTitle: "Creating a job",
		createDesc:
			'Click "New Backup Job" on the Backup Jobs page. Fill in the form and click "Create".',
		fields: [
			{
				label: "Agent",
				required: true,
				desc: "The machine that will run this job. Only active, connected agents can execute jobs.",
			},
			{
				label: "Job Name",
				required: true,
				desc: 'A descriptive name for this job, e.g. "Daily Backup".',
			},
			{
				label: "Cron Expression",
				required: true,
				desc: 'Standard 5-field cron syntax. For example, "0 2 * * *" runs daily at 2 AM. The job fires on the agent\'s local system clock.',
			},
			{
				label: "Files / Directories",
				required: true,
				desc: "One absolute path per line. Both files and directories are supported. The agent resolves these paths on the target machine.",
			},
			{
				label: "Compression",
				required: false,
				desc: "Level 9 (default) gives maximum compression but takes longer. Level 5 is a good balance. Level 0 skips compression entirely — fastest but largest files.",
			},
			{
				label: "Retention Policy",
				required: false,
				desc: 'Attach a policy to automatically delete old backups for this job. Choose "No policy" to keep all backups.',
			},
			{
				label: "Password Protection",
				required: false,
				desc: "When checked, an Archive Password field appears. The 7z archive will be encrypted — the password is required to open the file.",
			},
			{
				label: "Active",
				required: false,
				desc: "Inactive jobs are not scheduled and cannot be triggered manually. Defaults to active.",
			},
		],
		cronExamples: [
			{ expr: "0 2 * * *", desc: "Daily at 2:00 AM" },
			{ expr: "0 */6 * * *", desc: "Every 6 hours" },
			{ expr: "0 3 * * 1", desc: "Every Monday at 3:00 AM" },
			{ expr: "0 0 1 * *", desc: "First day of every month" },
		],
		actionsTitle: "Row actions",
		actions: [
			{
				name: "Test Job",
				desc: "Trigger the job immediately, outside of the schedule. Useful to verify the agent can reach the files and that compression works.",
			},
			{
				name: "View",
				desc: "Inspect the job configuration in read-only mode.",
			},
			{
				name: "Edit",
				desc: "Update any field. Changes take effect on the next run.",
			},
			{
				name: "Duplicate",
				desc: "Copy the job configuration into a new job. The agent field is cleared so you can target a different machine.",
			},
			{
				name: "Delete",
				desc: "Permanently removes the job and its schedule. Existing backups are not deleted.",
			},
		],
		deleteWarning: "Deletion is permanent and cannot be undone.",
	},
	"pt-br": {
		title: "Criando um Job de Backup",
		subtitle:
			"Como definir um job de backup com agendamento, arquivos e configurações.",
		overviewTitle: "O que é um job de backup?",
		overviewDesc:
			"Um job de backup define o que fazer backup, quando e como. Cada job é direcionado a um agente específico e roda em um agendamento cron. Quando acionado, o agente comprime os caminhos listados em um arquivo 7z e o envia ao servidor.",
		createTitle: "Criando um job",
		createDesc:
			'Clique em "Novo Job de Backup" na página de Jobs de Backup. Preencha o formulário e clique em "Criar".',
		fields: [
			{
				label: "Agente",
				required: true,
				desc: "A máquina que executará este job. Apenas agentes ativos e conectados podem executar jobs.",
			},
			{
				label: "Nome do Job",
				required: true,
				desc: 'Um nome descritivo para este job, ex.: "Backup Diário".',
			},
			{
				label: "Expressão Cron",
				required: true,
				desc: 'Sintaxe cron padrão de 5 campos. Por exemplo, "0 2 * * *" roda diariamente às 2h. O job é disparado pelo relógio local do sistema do agente.',
			},
			{
				label: "Arquivos / Diretórios",
				required: true,
				desc: "Um caminho absoluto por linha. Arquivos e diretórios são suportados. O agente resolve esses caminhos na máquina alvo.",
			},
			{
				label: "Compressão",
				required: false,
				desc: "Nível 9 (padrão) oferece máxima compressão mas leva mais tempo. Nível 5 é um bom equilíbrio. Nível 0 pula a compressão — mais rápido, mas arquivos maiores.",
			},
			{
				label: "Política de Retenção",
				required: false,
				desc: 'Vincule uma política para excluir backups antigos automaticamente para este job. Escolha "Sem política" para manter todos os backups.',
			},
			{
				label: "Proteção por Senha",
				required: false,
				desc: "Quando marcado, um campo de Senha do Arquivo aparece. O arquivo 7z será criptografado — a senha é necessária para abrir o arquivo.",
			},
			{
				label: "Ativo",
				required: false,
				desc: "Jobs inativos não são agendados e não podem ser acionados manualmente. Ativo por padrão.",
			},
		],
		cronExamples: [
			{ expr: "0 2 * * *", desc: "Diariamente às 2h" },
			{ expr: "0 */6 * * *", desc: "A cada 6 horas" },
			{ expr: "0 3 * * 1", desc: "Toda segunda às 3h" },
			{ expr: "0 0 1 * *", desc: "Primeiro dia de cada mês" },
		],
		actionsTitle: "Ações da linha",
		actions: [
			{
				name: "Testar Job",
				desc: "Aciona o job imediatamente, fora do agendamento. Útil para verificar se o agente consegue acessar os arquivos e se a compressão funciona.",
			},
			{
				name: "Ver",
				desc: "Inspeciona a configuração do job em modo somente leitura.",
			},
			{
				name: "Editar",
				desc: "Atualiza qualquer campo. As alterações entram em vigor na próxima execução.",
			},
			{
				name: "Duplicar",
				desc: "Copia a configuração do job para um novo job. O campo de agente é limpo para que você possa direcionar a uma máquina diferente.",
			},
			{
				name: "Excluir",
				desc: "Remove permanentemente o job e seu agendamento. Backups existentes não são excluídos.",
			},
		],
		deleteWarning: "A exclusão é permanente e não pode ser desfeita.",
	},
};

function MockSelect({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1">
			<label className="text-xs font-medium">{label}</label>
			<div className="border rounded-md px-3 py-1.5 text-xs text-muted-foreground bg-background flex justify-between">
				<span>{value}</span>
				<span>▾</span>
			</div>
		</div>
	);
}

function MockInput({
	label,
	placeholder,
}: {
	label: string;
	placeholder: string;
}) {
	return (
		<div className="flex flex-col gap-1">
			<label className="text-xs font-medium">{label}</label>
			<div className="border rounded-md px-3 py-1.5 text-xs text-muted-foreground bg-background">
				{placeholder}
			</div>
		</div>
	);
}

function MockTextarea({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1">
			<label className="text-xs font-medium">{label}</label>
			<div className="border rounded-md px-3 py-2 text-xs text-muted-foreground bg-background whitespace-pre-wrap leading-relaxed">
				{value}
			</div>
		</div>
	);
}

export function CreatingAJobPage({ nextPage, onNext, lang }: Props) {
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

			<hr />

			{/* Create */}
			<div className="flex flex-col gap-3">
				<div>
					<h3 className="text-sm font-semibold">{c.createTitle}</h3>
					<p className="text-sm text-muted-foreground mt-1">{c.createDesc}</p>
				</div>

				{/* New Job button */}
				<div className="dynround w-full min-h-20 flex items-center justify-center">
					<button
						type="button"
						className="inline-flex items-center gap-1.5 rounded-md border bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 pointer-events-none"
					>
						<Plus size={13} weight="bold" />
						{lang === "en" ? "New Backup Job" : "Novo Job de Backup"}
					</button>
				</div>

				{/* Full dialog mockup */}
				<div className="dynround w-full min-h-20 flex items-center justify-center py-4">
					<div className="border rounded-lg bg-background shadow-sm p-4 w-80 flex flex-col gap-3">
						<div>
							<p className="text-xs font-semibold">
								{lang === "en" ? "New Backup Job" : "Novo Job de Backup"}
							</p>
							<p className="text-xs text-muted-foreground">
								{lang === "en"
									? "Create a new backup job with schedule and files."
									: "Crie um novo job de backup com agendamento e arquivos."}
							</p>
						</div>
						<MockSelect
							label={c.fields[0].label}
							value={lang === "en" ? "Select an agent" : "Selecione um agente"}
						/>
						<MockInput
							label={c.fields[1].label}
							placeholder={lang === "en" ? "Daily Backup" : "Backup Diário"}
						/>
						<MockInput label={c.fields[2].label} placeholder="0 2 * * *" />
						<MockTextarea
							label={c.fields[3].label}
							value={
								lang === "en"
									? "C:\\Users\\admin\\Documents\nD:\\Projects"
									: "C:\\Users\\admin\\Documentos\nD:\\Projetos"
							}
						/>
						<MockSelect
							label={c.fields[4].label}
							value={lang === "en" ? "High (9)" : "Alto (9)"}
						/>
						<MockSelect
							label={c.fields[5].label}
							value={lang === "en" ? "No policy" : "Sem política"}
						/>
						<div className="flex items-center gap-2">
							<div className="w-3.5 h-3.5 rounded-sm border bg-primary flex items-center justify-center">
								<span className="text-primary-foreground text-[8px]">✓</span>
							</div>
							<label className="text-xs font-medium">{c.fields[7].label}</label>
						</div>
						<div className="flex items-center gap-2">
							<div className="w-3.5 h-3.5 rounded-sm border" />
							<label className="text-xs font-medium">{c.fields[6].label}</label>
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

				{/* Field descriptions */}
				<div className="flex flex-col gap-2">
					{c.fields.map((f) => (
						<p key={f.label} className="text-sm">
							<strong>{f.label}</strong>
							{f.required && (
								<span className="text-destructive text-xs ml-0.5">*</span>
							)}{" "}
							<span className="text-muted-foreground">— {f.desc}</span>
						</p>
					))}
				</div>
			</div>

			<hr />

			{/* Cron reference */}
			<div className="flex flex-col gap-2">
				<h3 className="text-sm font-semibold">
					{lang === "en" ? "Cron quick reference" : "Referência rápida de cron"}
				</h3>
				<div className="dynround w-full min-h-20 flex items-center justify-center px-4">
					<table className="w-full text-xs">
						<thead>
							<tr className="text-left text-muted-foreground border-b">
								<th className="pb-1 pr-4 font-medium">
									{lang === "en" ? "Expression" : "Expressão"}
								</th>
								<th className="pb-1 font-medium">
									{lang === "en" ? "Meaning" : "Significado"}
								</th>
							</tr>
						</thead>
						<tbody>
							{c.cronExamples.map((ex) => (
								<tr key={ex.expr} className="border-b last:border-0">
									<td className="py-1 pr-4 font-mono text-foreground">
										{ex.expr}
									</td>
									<td className="py-1 text-muted-foreground">{ex.desc}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>

			<hr />

			{/* Row actions */}
			<div className="flex flex-col gap-3">
				<h3 className="text-sm font-semibold">{c.actionsTitle}</h3>

				<div className="dynround w-full min-h-20 flex items-center justify-center">
					<div className="flex items-center gap-1.5 text-xs border rounded-lg px-3 py-2 bg-background">
						<span className="font-medium text-foreground mr-2">
							{lang === "en" ? "Daily Backup" : "Backup Diário"}
						</span>
						<button
							type="button"
							className="inline-flex items-center gap-1 rounded border px-2 py-1 pointer-events-none"
						>
							<TestTube size={12} />
						</button>
						<button
							type="button"
							className="inline-flex items-center gap-1 rounded border px-2 py-1 pointer-events-none"
						>
							<Eye size={12} />
						</button>
						<button
							type="button"
							className="inline-flex items-center gap-1 rounded border px-2 py-1 pointer-events-none"
						>
							<Pencil size={12} />
						</button>
						<button
							type="button"
							className="inline-flex items-center gap-1 rounded border px-2 py-1 pointer-events-none"
						>
							<Copy size={12} />
						</button>
						<button
							type="button"
							className="inline-flex items-center gap-1 rounded border border-destructive text-destructive px-2 py-1 pointer-events-none"
						>
							<XSquare size={12} />
						</button>
					</div>
				</div>

				<div className="flex flex-col gap-2">
					{c.actions.map((a) => (
						<p key={a.name} className="text-sm">
							<strong>{a.name}</strong>{" "}
							<span className="text-muted-foreground">— {a.desc}</span>
						</p>
					))}
				</div>

				<p className="text-sm text-destructive font-medium">
					<em>{c.deleteWarning}</em>
				</p>
			</div>

			<PageNav nextPage={nextPage} onNext={onNext} lang={lang} />
		</div>
	);
}
