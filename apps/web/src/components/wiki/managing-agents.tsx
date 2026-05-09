import type { WikiLang } from "@/components/dialog/wiki/wiki";
import {
	CheckSquare,
	ClipboardText,
	CodeSimple,
	Eye,
	FloppyDisk,
	Package,
	Pencil,
	Plus,
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
		title: "Managing Agents",
		subtitle: "How to register, configure, and monitor agents.",
		overviewTitle: "What is an agent?",
		overviewDesc:
			"An agent is a small background service that runs on each machine you want to back up. It maintains a persistent connection to the server, receives backup job commands, compresses the target files locally using 7-Zip, and uploads the result. The agent runs as a Windows service and starts automatically with the system.",
		statusTitle: "Agent status",
		statuses: [
			{ label: "Connected", desc: "Agent is online and idle." },
			{ label: "Running", desc: "Currently executing a backup job." },
			{ label: "Queued", desc: "Has jobs waiting to run." },
			{ label: "Stale", desc: "Connected but no heartbeat in the last 60 seconds." },
			{ label: "Disconnected", desc: "Offline or not reachable." },
		],
		createTitle: "Registering an agent",
		createDesc:
			'Click "New Agent" on the Agents page, give it a name, and click "Add". This creates the agent record in the dashboard. The agent software must then be installed on the target machine and paired using the pairing code.',
		pairingTitle: "Pairing code",
		pairingDesc:
			'After creating an agent, click the "Pairing Code" button on its row to generate a one-time code. This code is entered into the agent installer during setup to link the machine to the agent record. Codes expire automatically.',
		pairingNote:
			"The Pairing Code button is only available while the agent is active. If the agent is disabled, re-enable it first.",
		installTitle: "Installing the agent (Windows)",
		installDesc:
			"The agent is installed via a PowerShell script. Open PowerShell as Administrator and run the one-liner below to download and launch the installer interactively:",
		installCmd:
			'iex (irm "https://raw.githubusercontent.com/calirko/backupr/refs/heads/main/apps/agent/scripts/install.ps1")',
		installAdminNote:
			"PowerShell must be run as Administrator. The script will attempt to relaunch itself with elevated privileges if it detects it is not already elevated.",
		installSteps: [
			{
				step: "1. Install",
				desc: "Downloads the agent binary, WinSW (service wrapper), and 7-Zip. Registers the Windows service.",
			},
			{
				step: "2. Setup",
				desc: "Prompts for the pairing code from the dashboard. Writes the configuration file that links this machine to the server.",
			},
			{
				step: "3. Start",
				desc: "Sets the service to auto-start and launches it. The agent connects to the server and appears as connected in the dashboard.",
			},
		],
		installDir: "Files are installed to C:\\ProgramData\\backupr.",
		menuTitle: "Installer menu actions",
		menuItems: [
			{ name: "Install", desc: "Download and register the service." },
			{ name: "Setup", desc: "Enter pairing code and write config." },
			{ name: "Start / Stop / Restart", desc: "Control the Windows service." },
			{ name: "Status", desc: "Show paths, config presence, and service state." },
			{ name: "Remove", desc: "Unregister the service. Files are kept in place." },
		],
		viewTitle: "Viewing agent details",
		viewDesc:
			"Click the eye icon on any agent row to see its active sessions, system information (hostname, OS, CPUs, architecture), agent version, and all pending pairing codes.",
		editTitle: "Editing an agent",
		editDesc: "Click the pencil icon to rename the agent.",
		disableTitle: "Disabling an agent",
		disableDesc:
			"Click the disable icon on the row. A disabled agent cannot receive jobs or generate pairing codes. Its existing backups and jobs are preserved.",
		jobsTitle: "Viewing backup jobs",
		jobsDesc:
			'Click the "Backup Jobs" icon on any agent row to see all jobs configured for that agent, trigger runs manually, or download the latest backup.',
	},
	"pt-br": {
		title: "Gerenciando Agentes",
		subtitle: "Como registrar, configurar e monitorar agentes.",
		overviewTitle: "O que é um agente?",
		overviewDesc:
			"Um agente é um pequeno serviço em segundo plano que roda em cada máquina que você deseja fazer backup. Ele mantém uma conexão persistente com o servidor, recebe comandos de jobs de backup, comprime os arquivos alvo localmente usando o 7-Zip e envia o resultado. O agente roda como um serviço do Windows e inicia automaticamente com o sistema.",
		statusTitle: "Status do agente",
		statuses: [
			{ label: "Conectado", desc: "Agente online e ocioso." },
			{ label: "Executando", desc: "Executando um job de backup no momento." },
			{ label: "Na fila", desc: "Possui jobs aguardando execução." },
			{ label: "Instável", desc: "Conectado, mas sem heartbeat nos últimos 60 segundos." },
			{ label: "Desconectado", desc: "Offline ou inacessível." },
		],
		createTitle: "Registrando um agente",
		createDesc:
			'Clique em "Novo Agente" na página de Agentes, dê um nome a ele e clique em "Adicionar". Isso cria o registro do agente no painel. O software do agente deve então ser instalado na máquina alvo e pareado usando o código de pareamento.',
		pairingTitle: "Código de pareamento",
		pairingDesc:
			'Após criar um agente, clique no botão "Código de Pareamento" na linha correspondente para gerar um código de uso único. Esse código é inserido no instalador do agente durante a configuração para vincular a máquina ao registro do agente. Os códigos expiram automaticamente.',
		pairingNote:
			"O botão de Código de Pareamento só está disponível enquanto o agente está ativo. Se o agente estiver desativado, reative-o primeiro.",
		installTitle: "Instalando o agente (Windows)",
		installDesc:
			"O agente é instalado via script PowerShell. Abra o PowerShell como Administrador e execute o comando abaixo para baixar e iniciar o instalador de forma interativa:",
		installCmd:
			'iex (irm "https://raw.githubusercontent.com/calirko/backupr/refs/heads/main/apps/agent/scripts/install.ps1")',
		installAdminNote:
			"O PowerShell deve ser executado como Administrador. O script tentará se reiniciar com privilégios elevados caso detecte que não está rodando com permissões de administrador.",
		installSteps: [
			{
				step: "1. Instalar",
				desc: "Baixa o binário do agente, o WinSW (wrapper de serviço) e o 7-Zip. Registra o serviço do Windows.",
			},
			{
				step: "2. Configurar",
				desc: "Solicita o código de pareamento do painel. Grava o arquivo de configuração que vincula esta máquina ao servidor.",
			},
			{
				step: "3. Iniciar",
				desc: "Define o serviço para iniciar automaticamente e o inicia. O agente se conecta ao servidor e aparece como conectado no painel.",
			},
		],
		installDir: "Os arquivos são instalados em C:\\ProgramData\\backupr.",
		menuTitle: "Ações do menu do instalador",
		menuItems: [
			{ name: "Instalar", desc: "Baixa e registra o serviço." },
			{ name: "Configurar", desc: "Insere o código de pareamento e grava a configuração." },
			{ name: "Iniciar / Parar / Reiniciar", desc: "Controla o serviço do Windows." },
			{ name: "Status", desc: "Exibe caminhos, presença de configuração e estado do serviço." },
			{ name: "Remover", desc: "Cancela o registro do serviço. Os arquivos são mantidos no lugar." },
		],
		viewTitle: "Visualizando detalhes do agente",
		viewDesc:
			"Clique no ícone de olho em qualquer linha de agente para ver suas sessões ativas, informações do sistema (hostname, SO, CPUs, arquitetura), versão do agente e todos os códigos de pareamento pendentes.",
		editTitle: "Editando um agente",
		editDesc: "Clique no ícone de lápis para renomear o agente.",
		disableTitle: "Desativando um agente",
		disableDesc:
			"Clique no ícone de desativar na linha. Um agente desativado não pode receber jobs nem gerar códigos de pareamento. Seus backups e jobs existentes são preservados.",
		jobsTitle: "Visualizando jobs de backup",
		jobsDesc:
			'Clique no ícone "Jobs de Backup" em qualquer linha de agente para ver todos os jobs configurados para aquele agente, acionar execuções manualmente ou baixar o backup mais recente.',
	},
};

export function ManagingAgentsPage({ nextPage, onNext, lang }: Props) {
	const c = content[lang];

	return (
		<div className="flex flex-col gap-5">
			<div>
				<h2 className="text-base font-semibold">{c.title}</h2>
				<p className="text-sm text-muted-foreground mt-1">{c.subtitle}</p>
			</div>

			<hr />

			{/* Overview */}
			<div>
				<h3 className="text-sm font-semibold">{c.overviewTitle}</h3>
				<p className="text-sm text-muted-foreground mt-1">{c.overviewDesc}</p>
			</div>

			{/* Status */}
			<div>
				<h3 className="text-sm font-semibold">{c.statusTitle}</h3>
				<div className="flex flex-col gap-1.5 mt-2">
					{c.statuses.map((s) => (
						<p key={s.label} className="text-sm">
							<strong>{s.label}</strong>{" "}
							<span className="text-muted-foreground">— {s.desc}</span>
						</p>
					))}
				</div>
			</div>

			<hr />

			{/* Register */}
			<div className="flex flex-col gap-3">
				<div>
					<h3 className="text-sm font-semibold">{c.createTitle}</h3>
					<p className="text-sm text-muted-foreground mt-1">{c.createDesc}</p>
				</div>

				<div className="dynround w-full min-h-20 flex items-center justify-center gap-3">
					<button
						type="button"
						className="inline-flex items-center gap-1.5 rounded-md border bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 pointer-events-none"
					>
						<Plus size={13} weight="bold" />
						{lang === "en" ? "New Agent" : "Novo Agente"}
					</button>

					<div className="border rounded-lg bg-background shadow-sm p-4 w-56 flex flex-col gap-3">
						<p className="text-xs font-semibold">
							{lang === "en" ? "Add Agent" : "Adicionar Agente"}
						</p>
						<div className="flex flex-col gap-1">
							<label className="text-xs font-medium">
								{lang === "en" ? "Name" : "Nome"}
							</label>
							<div className="border rounded-md px-3 py-1.5 text-xs text-muted-foreground bg-background">
								{lang === "en" ? "My Server" : "Meu Servidor"}
							</div>
						</div>
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
								<Plus size={13} weight="bold" />
								{lang === "en" ? "Add" : "Adicionar"}
							</button>
						</div>
					</div>
				</div>
			</div>

			{/* Pairing code */}
			<div className="flex flex-col gap-3">
				<div>
					<h3 className="text-sm font-semibold">{c.pairingTitle}</h3>
					<p className="text-sm text-muted-foreground mt-1">{c.pairingDesc}</p>
					<p className="text-sm text-muted-foreground mt-1">
						<em>{c.pairingNote}</em>
					</p>
				</div>

				<div className="dynround w-full min-h-20 flex items-center justify-center gap-3">
					<button
						type="button"
						className="inline-flex items-center gap-1.5 rounded-md border text-xs font-medium px-3 py-1.5 pointer-events-none"
					>
						<CodeSimple size={13} />
						{lang === "en" ? "Pairing Code" : "Código de Pareamento"}
					</button>

					<div className="border rounded-lg bg-background shadow-sm p-4 w-64 flex flex-col gap-3">
						<p className="text-xs font-semibold">
							{lang === "en" ? "Agent Pairing Code" : "Código de Pareamento"}
						</p>
						<div className="border rounded-md px-3 py-2 text-xs font-mono text-muted-foreground bg-muted/40 break-all">
							eyJhbGciOiJIUzI1NiIsInR5cCI6Ik...
						</div>
						<p className="text-xs text-muted-foreground">
							{lang === "en"
								? "Expires at 2025-01-15 14:30"
								: "Expira em 15/01/2025 às 14:30"}
						</p>
						<div className="flex justify-end gap-2">
							<button
								type="button"
								className="inline-flex items-center gap-1.5 rounded-md border text-xs font-medium px-3 py-1.5 pointer-events-none"
							>
								<XSquare size={13} />
								{lang === "en" ? "Close" : "Fechar"}
							</button>
							<button
								type="button"
								className="inline-flex items-center gap-1.5 rounded-md border bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 pointer-events-none"
							>
								<ClipboardText size={13} />
								{lang === "en" ? "Copy" : "Copiar"}
							</button>
						</div>
					</div>
				</div>
			</div>

			<hr />

			{/* Install */}
			<div className="flex flex-col gap-3">
				<div>
					<h3 className="text-sm font-semibold">{c.installTitle}</h3>
					<p className="text-sm text-muted-foreground mt-1">{c.installDesc}</p>
				</div>

				<div className="dynround w-full min-h-20 flex items-center justify-center px-4">
					<div className="w-full rounded-md bg-muted/60 border px-4 py-3 font-mono text-xs break-all select-all">
						{c.installCmd}
					</div>
				</div>

				<p className="text-sm text-muted-foreground">
					<em>{c.installAdminNote}</em>
				</p>

				<div>
					<h3 className="text-sm font-semibold">{c.menuTitle}</h3>
					<div className="flex flex-col gap-1.5 mt-2">
						{c.installSteps.map((s) => (
							<p key={s.step} className="text-sm">
								<strong>{s.step}</strong>{" "}
								<span className="text-muted-foreground">— {s.desc}</span>
							</p>
						))}
					</div>
				</div>

				<div className="dynround w-full min-h-20 flex items-center justify-center px-4">
					<div className="border rounded-lg bg-background shadow-sm p-3 w-64 flex flex-col gap-1 text-xs font-mono">
						<p className="text-muted-foreground">+------------------------------+</p>
						<p className="text-primary font-semibold">|   Backupr Agent Manager      |</p>
						<p className="text-muted-foreground">+------------------------------+</p>
						{c.menuItems.map((m) => (
							<p key={m.name} className="text-muted-foreground">
								| <span className="text-foreground">{m.name}</span> — {m.desc}
							</p>
						))}
						<p className="text-muted-foreground">+------------------------------+</p>
					</div>
				</div>

				<p className="text-sm text-muted-foreground">
					<em>{c.installDir}</em>
				</p>
			</div>

			<hr />

			{/* Row actions */}
			<div className="flex flex-col gap-3">
				<div>
					<h3 className="text-sm font-semibold">{c.viewTitle}</h3>
					<p className="text-sm text-muted-foreground mt-1">{c.viewDesc}</p>
				</div>

				<div className="dynround w-full min-h-20 flex items-center justify-center">
					<div className="border rounded-lg bg-background shadow-sm p-3 w-72 flex flex-col gap-2">
						<p className="text-xs font-semibold">
							{lang === "en" ? "Agent Details" : "Detalhes do Agente"}
						</p>
						<div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
							<span className="text-muted-foreground">{lang === "en" ? "Status" : "Status"}</span>
							<span className="flex items-center gap-1 text-green-600">
								<CheckSquare size={12} /> {lang === "en" ? "Active" : "Ativo"}
							</span>
							<span className="text-muted-foreground">Hostname</span>
							<span>WIN-SRV01</span>
							<span className="text-muted-foreground">OS</span>
							<span>Windows 11</span>
							<span className="text-muted-foreground">{lang === "en" ? "Version" : "Versão"}</span>
							<span>1.0.0</span>
						</div>
					</div>
				</div>

				<div>
					<h3 className="text-sm font-semibold">{c.editTitle}</h3>
					<p className="text-sm text-muted-foreground mt-1">{c.editDesc}</p>
				</div>

				<div>
					<h3 className="text-sm font-semibold">{c.disableTitle}</h3>
					<p className="text-sm text-muted-foreground mt-1">{c.disableDesc}</p>
				</div>

				<div>
					<h3 className="text-sm font-semibold">{c.jobsTitle}</h3>
					<p className="text-sm text-muted-foreground mt-1">{c.jobsDesc}</p>
				</div>

				{/* Row actions summary mockup */}
				<div className="dynround w-full min-h-20 flex items-center justify-center">
					<div className="flex items-center gap-1.5 text-xs text-muted-foreground border rounded-lg px-3 py-2 bg-background">
						<span className="font-medium text-foreground mr-2">WIN-SRV01</span>
						<button type="button" className="inline-flex items-center gap-1 rounded border px-2 py-1 pointer-events-none">
							<CodeSimple size={12} />
						</button>
						<button type="button" className="inline-flex items-center gap-1 rounded border px-2 py-1 pointer-events-none">
							<Package size={12} />
						</button>
						<button type="button" className="inline-flex items-center gap-1 rounded border px-2 py-1 pointer-events-none">
							<Eye size={12} />
						</button>
						<button type="button" className="inline-flex items-center gap-1 rounded border px-2 py-1 pointer-events-none">
							<Pencil size={12} />
						</button>
						<button type="button" className="inline-flex items-center gap-1 rounded border border-destructive text-destructive px-2 py-1 pointer-events-none">
							<XSquare size={12} />
						</button>
					</div>
				</div>

				{/* Edit dialog mockup */}
				<div className="dynround w-full min-h-20 flex items-center justify-center gap-3">
					<button
						type="button"
						className="inline-flex items-center gap-1.5 rounded-md border text-xs font-medium px-3 py-1.5 pointer-events-none"
					>
						<Pencil size={13} />
						{lang === "en" ? "Edit" : "Editar"}
					</button>
					<div className="border rounded-lg bg-background shadow-sm p-4 w-56 flex flex-col gap-3">
						<p className="text-xs font-semibold">
							{lang === "en" ? "Edit Agent" : "Editar Agente"}
						</p>
						<div className="flex flex-col gap-1">
							<label className="text-xs font-medium">
								{lang === "en" ? "Name" : "Nome"}
							</label>
							<div className="border rounded-md px-3 py-1.5 text-xs bg-background">
								WIN-SRV01
							</div>
						</div>
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
			</div>

			<PageNav nextPage={nextPage} onNext={onNext} lang={lang} />
		</div>
	);
}
