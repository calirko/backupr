import {
	ClockCounterClockwise,
	DownloadSimple,
	Lightning,
	TestTube,
} from "@phosphor-icons/react";
import type { WikiLang } from "@/components/dialog/wiki/wiki";
import { PageNav } from "./page-nav";

interface Props {
	nextPage: { id: string; name: string } | null;
	onNext: () => void;
	lang: WikiLang;
}

const content = {
	en: {
		title: "Making Backups",
		subtitle: "How to trigger backups manually and monitor their progress.",
		scheduledTitle: "Scheduled backups",
		scheduledDesc:
			"Every backup job has a cron expression that controls when it runs automatically. The server dispatches the job to the agent at the scheduled time via the open WebSocket connection. No user action is needed - as long as the agent is connected and the job is active, backups run on schedule.",
		manualTitle: "Triggering manually",
		manualDesc:
			"There are two ways to trigger a backup outside of its schedule:",
		manualMethods: [
			{
				name: "Lightning button (Backups page)",
				desc: 'On the Backups page, click the agent row to open its jobs. Each job card has a lightning bolt button in the footer. Clicking it sends an immediate trigger command to the agent via WebSocket and shows a "Backup queued" notification.',
			},
			{
				name: "Test Job (Backup Jobs page)",
				desc: "On the Backup Jobs page, click the test tube icon on any job row. This opens a test dialog that triggers the job immediately, the same way the lightning button does.",
			},
		],
		lightningTitle: "The lightning button",
		lightningDesc:
			"The lightning button appears on each job card on the Backups page. It sends a trigger command directly through the WebSocket - no page reload required. The button is disabled in two cases:",
		lightningDisabled: [
			{
				condition: "Agent is busy or offline",
				desc: "The agent is already running another job, is queued, or is not connected. Only one job can run at a time per agent.",
			},
			{
				condition: "Job is inactive",
				desc: "Inactive jobs cannot be triggered manually. Activate the job first from the Backup Jobs page.",
			},
		],
		lightningTooltip:
			"Hover over a disabled button to see the exact reason in the tooltip.",
		progressTitle: "Monitoring progress",
		progressDesc:
			"While a job is running, the agent sends live status messages back to the server over WebSocket. The job card shows a Progress row in blue monospace text that updates in real time - including the current file being compressed or uploaded.",
		statusTitle: "Backup statuses",
		statuses: [
			{
				label: "Pending",
				desc: "Job has been queued but the agent has not started yet.",
			},
			{
				label: "In Progress",
				desc: "Agent is actively compressing and uploading.",
			},
			{
				label: "Completed",
				desc: "Backup finished successfully and is available for download.",
			},
			{
				label: "Failed",
				desc: "Something went wrong. Check the agent logs for details.",
			},
		],
		downloadTitle: "Downloading backups",
		downloadLatestDesc:
			'Click "Latest" on any job card to immediately download the most recent completed backup. The server generates a short-lived presigned URL and opens it in a new tab - the file is served directly from storage.',
		downloadVersionsDesc:
			'Click "Versions" to open the backup history for a job. Each version is listed with its date and status. You can download any individual backup from this list.',
		downloadNote:
			"Download links expire after 7 days. If a link has expired, open the Versions dialog and generate a fresh one.",
	},
	"pt-br": {
		title: "Fazendo Backups",
		subtitle: "Como acionar backups manualmente e monitorar seu progresso.",
		scheduledTitle: "Backups agendados",
		scheduledDesc:
			"Todo job de backup tem uma expressão cron que controla quando ele é executado automaticamente. O servidor despacha o job ao agente no horário agendado via a conexão WebSocket aberta. Nenhuma ação do usuário é necessária - enquanto o agente estiver conectado e o job ativo, os backups rodam conforme o agendamento.",
		manualTitle: "Acionamento manual",
		manualDesc: "Há duas formas de acionar um backup fora do seu agendamento:",
		manualMethods: [
			{
				name: "Botão raio (página de Backups)",
				desc: 'Na página de Backups, clique na linha do agente para abrir seus jobs. Cada card de job tem um botão de raio no rodapé. Clicar nele envia um comando de acionamento imediato ao agente via WebSocket e exibe uma notificação de "Backup na fila".',
			},
			{
				name: "Testar Job (página de Jobs de Backup)",
				desc: "Na página de Jobs de Backup, clique no ícone de tubo de ensaio em qualquer linha de job. Isso abre um diálogo que aciona o job imediatamente, da mesma forma que o botão raio.",
			},
		],
		lightningTitle: "O botão raio",
		lightningDesc:
			"O botão raio aparece em cada card de job na página de Backups. Ele envia um comando de acionamento diretamente pelo WebSocket - sem recarregamento de página. O botão é desativado em dois casos:",
		lightningDisabled: [
			{
				condition: "Agente ocupado ou offline",
				desc: "O agente já está executando outro job, está na fila ou não está conectado. Apenas um job pode rodar por vez por agente.",
			},
			{
				condition: "Job inativo",
				desc: "Jobs inativos não podem ser acionados manualmente. Ative o job primeiro na página de Jobs de Backup.",
			},
		],
		lightningTooltip:
			"Passe o mouse sobre um botão desativado para ver o motivo exato na dica.",
		progressTitle: "Monitorando o progresso",
		progressDesc:
			"Enquanto um job está rodando, o agente envia mensagens de status em tempo real ao servidor pelo WebSocket. O card do job exibe uma linha de Progresso em texto monoespaçado azul que atualiza em tempo real - incluindo o arquivo atual sendo comprimido ou enviado.",
		statusTitle: "Status dos backups",
		statuses: [
			{
				label: "Pendente",
				desc: "O job foi enfileirado, mas o agente ainda não começou.",
			},
			{
				label: "Em andamento",
				desc: "O agente está ativamente comprimindo e enviando.",
			},
			{
				label: "Concluído",
				desc: "Backup finalizado com sucesso e disponível para download.",
			},
			{
				label: "Falhou",
				desc: "Algo deu errado. Verifique os logs do agente para detalhes.",
			},
		],
		downloadTitle: "Baixando backups",
		downloadLatestDesc:
			'Clique em "Último" em qualquer card de job para baixar imediatamente o backup mais recente concluído. O servidor gera uma URL pré-assinada de curta duração e a abre em uma nova aba - o arquivo é servido diretamente do armazenamento.',
		downloadVersionsDesc:
			'Clique em "Versões" para abrir o histórico de backups de um job. Cada versão é listada com sua data e status. Você pode baixar qualquer backup individual desta lista.',
		downloadNote:
			"Os links de download expiram após 7 dias. Se um link expirou, abra o diálogo de Versões e gere um novo.",
	},
};

export function MakingBackupsPage({ nextPage, onNext, lang }: Props) {
	const c = content[lang];

	return (
		<div className="flex flex-col gap-5">
			<div>
				<h2 className="text-base font-semibold">{c.title}</h2>
				<p className="text-sm text-muted-foreground mt-1">{c.subtitle}</p>
			</div>

			<hr />

			{/* Scheduled */}
			<div>
				<h3 className="text-sm font-semibold">{c.scheduledTitle}</h3>
				<p className="text-sm text-muted-foreground mt-1">{c.scheduledDesc}</p>
			</div>

			<hr />

			{/* Manual triggering */}
			<div className="flex flex-col gap-3">
				<div>
					<h3 className="text-sm font-semibold">{c.manualTitle}</h3>
					<p className="text-sm text-muted-foreground mt-1">{c.manualDesc}</p>
				</div>

				<div className="flex flex-col gap-2">
					{c.manualMethods.map((m) => (
						<p key={m.name} className="text-sm">
							<strong>{m.name}</strong>{" "}
							<span className="text-muted-foreground">- {m.desc}</span>
						</p>
					))}
				</div>
			</div>

			{/* Lightning button deep dive */}
			<div className="flex flex-col gap-3">
				<div>
					<h3 className="text-sm font-semibold">{c.lightningTitle}</h3>
					<p className="text-sm text-muted-foreground mt-1">
						{c.lightningDesc}
					</p>
				</div>

				{/* Job card mockup */}
				<div className="dynround w-full min-h-20 flex items-center justify-center py-4">
					<div className="border rounded-lg bg-background shadow-sm w-64 overflow-hidden">
						<div className="p-4 pb-2 flex flex-col gap-0.5">
							<div className="flex items-center justify-between">
								<p className="text-xs font-semibold">
									{lang === "en" ? "Daily Backup" : "Backup Diário"}
								</p>
								<span
									className="text-xs font-medium"
									style={{ color: "var(--greenish, #4ade80)" }}
								>
									{lang === "en" ? "Active" : "Ativo"}
								</span>
							</div>
							<p className="text-xs text-muted-foreground">0 2 * * *</p>
						</div>
						<div className="px-4 py-2 flex flex-col gap-1.5 text-xs">
							<div className="flex justify-between">
								<span className="text-muted-foreground">
									{lang === "en" ? "Files" : "Arquivos"}
								</span>
								<span>3 items</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">
									{lang === "en" ? "Total backups" : "Total de backups"}
								</span>
								<span>12</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">
									{lang === "en" ? "Last run" : "Última execução"}
								</span>
								<span>2h ago</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">
									{lang === "en" ? "Last status" : "Último status"}
								</span>
								<span style={{ color: "var(--greenish, #4ade80)" }}>
									{lang === "en" ? "Completed" : "Concluído"}
								</span>
							</div>
							{/* Live progress row */}
							<div className="flex justify-between">
								<span className="text-muted-foreground">
									{lang === "en" ? "Progress" : "Progresso"}
								</span>
								<span className="text-xs" style={{ color: "var(--blueish)" }}>
									7z: 42%...
								</span>
							</div>
						</div>
						<div className="px-4 py-3 border-t flex gap-2">
							<button
								type="button"
								className="inline-flex items-center justify-center rounded-md border text-xs p-1.5 pointer-events-none"
								title={
									lang === "en" ? "Trigger backup now" : "Acionar backup agora"
								}
							>
								<Lightning size={14} />
							</button>
							<button
								type="button"
								className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border text-xs py-1.5 pointer-events-none"
							>
								<DownloadSimple size={13} />
								{lang === "en" ? "Latest" : "Último"}
							</button>
							<button
								type="button"
								className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border bg-primary text-primary-foreground text-xs py-1.5 pointer-events-none"
							>
								<ClockCounterClockwise size={13} />
								{lang === "en" ? "Versions" : "Versões"}
							</button>
						</div>
					</div>
				</div>

				<div className="flex flex-col gap-2">
					{c.lightningDisabled.map((d) => (
						<p key={d.condition} className="text-sm">
							<strong>{d.condition}</strong>{" "}
							<span className="text-muted-foreground">- {d.desc}</span>
						</p>
					))}
				</div>
				<p className="text-sm text-muted-foreground">
					<em>{c.lightningTooltip}</em>
				</p>

				{/* Disabled button mockup */}
				<div className="dynround w-full min-h-20 flex items-center justify-center gap-4">
					<div className="flex flex-col items-center gap-1.5">
						<button
							type="button"
							className="inline-flex items-center justify-center rounded-md border text-xs p-1.5 pointer-events-none opacity-100"
						>
							<Lightning size={14} />
						</button>
						<span className="text-xs text-muted-foreground">
							{lang === "en" ? "Ready" : "Pronto"}
						</span>
					</div>
					<div className="flex flex-col items-center gap-1.5">
						<button
							type="button"
							className="inline-flex items-center justify-center rounded-md border text-xs p-1.5 pointer-events-none opacity-40"
						>
							<Lightning size={14} />
						</button>
						<span className="text-xs text-muted-foreground">
							{lang === "en" ? "Agent busy" : "Agente ocupado"}
						</span>
					</div>
					<div className="flex flex-col items-center gap-1.5">
						<button
							type="button"
							className="inline-flex items-center justify-center rounded-md border text-xs p-1.5 pointer-events-none opacity-40"
						>
							<Lightning size={14} />
						</button>
						<span className="text-xs text-muted-foreground">
							{lang === "en" ? "Job inactive" : "Job inativo"}
						</span>
					</div>
					<div className="flex flex-col items-center gap-1.5">
						<button
							type="button"
							className="inline-flex items-center gap-1 rounded-md border text-xs px-2.5 py-1.5 pointer-events-none"
						>
							<TestTube size={13} />
							{lang === "en" ? "Test Job" : "Testar Job"}
						</button>
						<span className="text-xs text-muted-foreground">
							{lang === "en" ? "Jobs page" : "Pág. de jobs"}
						</span>
					</div>
				</div>
			</div>

			<hr />

			{/* Progress */}
			<div>
				<h3 className="text-sm font-semibold">{c.progressTitle}</h3>
				<p className="text-sm text-muted-foreground mt-1">{c.progressDesc}</p>
			</div>

			{/* Statuses */}
			<div className="flex flex-col gap-2">
				<h3 className="text-sm font-semibold">{c.statusTitle}</h3>
				{c.statuses.map((s) => (
					<p key={s.label} className="text-sm">
						<strong>{s.label}</strong>{" "}
						<span className="text-muted-foreground">- {s.desc}</span>
					</p>
				))}
			</div>

			<hr />

			{/* Download */}
			<div className="flex flex-col gap-3">
				<h3 className="text-sm font-semibold">{c.downloadTitle}</h3>
				<p className="text-sm text-muted-foreground">{c.downloadLatestDesc}</p>
				<p className="text-sm text-muted-foreground">
					{c.downloadVersionsDesc}
				</p>

				<div className="dynround w-full min-h-20 flex items-center justify-center gap-3">
					<button
						type="button"
						className="inline-flex items-center gap-1.5 rounded-md border text-xs font-medium px-3 py-1.5 pointer-events-none"
					>
						<DownloadSimple size={13} />
						{lang === "en" ? "Latest" : "Último"}
					</button>
					<button
						type="button"
						className="inline-flex items-center gap-1.5 rounded-md border bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 pointer-events-none"
					>
						<ClockCounterClockwise size={13} />
						{lang === "en" ? "Versions" : "Versões"}
					</button>
				</div>

				<p className="text-sm text-muted-foreground">
					<em>{c.downloadNote}</em>
				</p>
			</div>

			<PageNav nextPage={nextPage} onNext={onNext} lang={lang} />
		</div>
	);
}
