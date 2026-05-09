import type { WikiLang } from "@/components/dialog/wiki/wiki";
import { PageNav } from "./page-nav";

interface Props {
	nextPage: { id: string; name: string } | null;
	onNext: () => void;
	lang: WikiLang;
}

const content = {
	en: {
		title: "How It Works",
		subtitle: "An overview of the backupr architecture and backup flow.",
		archTitle: "Architecture",
		archDesc:
			"backupr is composed of three parts that work together: the server, the web dashboard, and the agent. The server is the central hub — it stores all configuration and backup data, and coordinates communication between the dashboard and the agents running on your machines.",
		flowTitle: "Backup flow",
		flowSteps: [
			{
				step: "1. Job dispatch",
				desc: "When a backup job is triggered (on schedule or manually), the server sends a command to the target agent via an open WebSocket connection.",
			},
			{
				step: "2. Compression",
				desc: "The agent receives the command, locates the configured files or directories on the local machine, and compresses them into a 7z archive using the job's compression settings.",
			},
			{
				step: "3. Upload",
				desc: "The compressed archive is uploaded to the server in chunks over HTTP. The server streams it into object storage (MinIO).",
			},
			{
				step: "4. Status update",
				desc: "Throughout the process, the agent reports progress back to the server. The dashboard reflects the current status in real time.",
			},
			{
				step: "5. Policy enforcement",
				desc: "After a backup completes, any attached retention policies are evaluated. Old backups that exceed the configured limits are automatically removed.",
			},
		],
		agentTitle: "Agent connection",
		agentDesc:
			"Each agent maintains a persistent WebSocket connection to the server after pairing. The server uses this channel to dispatch job commands and receive status reports. If the connection drops, the agent reconnects automatically with exponential backoff.",
		storageTitle: "Storage",
		storageDesc:
			"Backup archives are stored in MinIO, an S3-compatible object store. When you download a backup from the dashboard, a short-lived presigned URL is generated — the file is served directly from storage without passing through the server again.",
	},
	"pt-br": {
		title: "Como Funciona",
		subtitle: "Uma visão geral da arquitetura do backupr e do fluxo de backup.",
		archTitle: "Arquitetura",
		archDesc:
			"O backupr é composto por três partes que trabalham juntas: o servidor, o painel web e o agente. O servidor é o hub central — ele armazena toda a configuração e os dados de backup, e coordena a comunicação entre o painel e os agentes em execução nas suas máquinas.",
		flowTitle: "Fluxo de backup",
		flowSteps: [
			{
				step: "1. Despacho do job",
				desc: "Quando um job de backup é acionado (por agendamento ou manualmente), o servidor envia um comando ao agente alvo via uma conexão WebSocket aberta.",
			},
			{
				step: "2. Compressão",
				desc: "O agente recebe o comando, localiza os arquivos ou diretórios configurados na máquina local e os comprime em um arquivo 7z usando as configurações de compressão do job.",
			},
			{
				step: "3. Upload",
				desc: "O arquivo comprimido é enviado ao servidor em partes via HTTP. O servidor o transmite para o armazenamento de objetos (MinIO).",
			},
			{
				step: "4. Atualização de status",
				desc: "Durante todo o processo, o agente reporta o progresso ao servidor. O painel reflete o status atual em tempo real.",
			},
			{
				step: "5. Aplicação de políticas",
				desc: "Após a conclusão de um backup, as políticas de retenção associadas são avaliadas. Backups antigos que excedem os limites configurados são removidos automaticamente.",
			},
		],
		agentTitle: "Conexão do agente",
		agentDesc:
			"Cada agente mantém uma conexão WebSocket persistente com o servidor após o pareamento. O servidor usa esse canal para despachar comandos de job e receber relatórios de status. Se a conexão cair, o agente reconecta automaticamente com backoff exponencial.",
		storageTitle: "Armazenamento",
		storageDesc:
			"Os arquivos de backup são armazenados no MinIO, um armazenamento de objetos compatível com S3. Ao baixar um backup pelo painel, uma URL pré-assinada de curta duração é gerada — o arquivo é servido diretamente do armazenamento sem passar novamente pelo servidor.",
	},
};

export function HowItWorksPage({ nextPage, onNext, lang }: Props) {
	const c = content[lang];

	return (
		<div className="flex flex-col gap-5">
			<div>
				<h2 className="text-base font-semibold">{c.title}</h2>
				<p className="text-sm text-muted-foreground mt-1">{c.subtitle}</p>
			</div>

			<hr />

			<div>
				<h3 className="text-sm font-semibold">{c.archTitle}</h3>
				<p className="text-sm text-muted-foreground mt-1">{c.archDesc}</p>
			</div>

			<div>
				<h3 className="text-sm font-semibold">{c.flowTitle}</h3>
				<div className="flex flex-col gap-2 mt-2">
					{c.flowSteps.map((item) => (
						<p key={item.step} className="text-sm">
							<strong>{item.step}</strong>{" "}
							<span className="text-muted-foreground">— {item.desc}</span>
						</p>
					))}
				</div>
			</div>

			<hr />

			<div>
				<h3 className="text-sm font-semibold">{c.agentTitle}</h3>
				<p className="text-sm text-muted-foreground mt-1">{c.agentDesc}</p>
			</div>

			<div>
				<h3 className="text-sm font-semibold">{c.storageTitle}</h3>
				<p className="text-sm text-muted-foreground mt-1">{c.storageDesc}</p>
			</div>

			<PageNav nextPage={nextPage} onNext={onNext} lang={lang} />
		</div>
	);
}
