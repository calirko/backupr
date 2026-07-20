import { useEffect, useState } from "react";
import type { WikiLang } from "@/components/dialog/wiki/wiki";
import pkg from "../../../package.json";
import { PageNav } from "./page-nav";

interface Props {
	nextPage: { id: string; name: string } | null;
	onNext: () => void;
	lang: WikiLang;
}

const content = {
	en: {
		title: "Welcome to backupr",
		subtitle:
			"A self-hosted platform for automating file backups across your machines.",
		whatIsTitle: "What is backupr?",
		whatIsParts: [
			{
				bold: "backupr",
				rest: " is a self-hosted backup solution that lets you schedule and manage file backups from any machine running the ",
			},
			{ italic: "backupr agent" },
			{
				rest: ". All backup data is stored securely in your own infrastructure - no third-party cloud required.",
			},
		],
		howTitle: "How it fits together",
		howItems: [
			{
				name: "Server",
				desc: "The central API and coordination hub. Manages users, agents, jobs, policies, and stored backups.",
			},
			{
				name: "Web Dashboard",
				desc: "The interface you're using now. Configure agents, schedule jobs, set retention policies, and browse or download backups.",
			},
			{
				name: "Agent",
				desc: "A lightweight executable that runs on each machine you want to back up. It connects to the server, listens for job commands, compresses the target files, and uploads the result.",
			},
		],
		featuresTitle: "Key features",
		features: [
			"Agent pairing via one-time codes - no manual token configuration",
			"Cron-based job scheduling with configurable compression levels",
			"Backup retention policies (keep last N, expire after X days)",
			"Password-protected archives",
			"Secure download links with expiry",
			"Real-time status updates via WebSocket",
		],
		nextSteps:
			"Use the sidebar to navigate through each topic. Start with How It Works to get a mental model of the backup flow before diving into setup.",
	},
	"pt-br": {
		title: "Bem-vindo ao backupr",
		subtitle:
			"Uma plataforma auto-hospedada para automatizar backups de arquivos entre suas máquinas.",
		whatIsTitle: "O que é o backupr?",
		whatIsParts: [
			{
				bold: "backupr",
				rest: " é uma solução de backup auto-hospedada que permite agendar e gerenciar backups de arquivos de qualquer máquina que execute o ",
			},
			{ italic: "agente backupr" },
			{
				rest: ". Todos os dados de backup são armazenados com segurança na sua própria infraestrutura - sem dependência de nuvem de terceiros.",
			},
		],
		howTitle: "Como as partes se conectam",
		howItems: [
			{
				name: "Servidor",
				desc: "O hub central de API e coordenação. Gerencia usuários, agentes, jobs, políticas e backups armazenados.",
			},
			{
				name: "Painel Web",
				desc: "A interface que você está usando agora. Configure agentes, agende jobs, defina políticas de retenção e navegue ou baixe backups.",
			},
			{
				name: "Agente",
				desc: "Um executável leve que roda em cada máquina que você deseja fazer backup. Ele se conecta ao servidor, aguarda comandos de job, comprime os arquivos alvo e envia o resultado.",
			},
		],
		featuresTitle: "Principais funcionalidades",
		features: [
			"Pareamento de agentes via códigos de uso único - sem configuração manual de token",
			"Agendamento de jobs baseado em cron com níveis de compressão configuráveis",
			"Políticas de retenção de backup (manter os últimos N, expirar após X dias)",
			"Arquivos protegidos por senha",
			"Links de download seguros com expiração",
			"Atualizações de status em tempo real via WebSocket",
		],
		nextSteps:
			"Use a barra lateral para navegar pelos tópicos. Comece por Como Funciona para ter uma visão geral do fluxo de backup antes de prosseguir com a configuração.",
	},
};

export function IntroductionPage({ nextPage, onNext, lang }: Props) {
	const c = content[lang];
	const [serverVersion, setServerVersion] = useState<string | null>(null);

	useEffect(() => {
		fetch("/api/ping")
			.then((r) => r.json())
			.then((d) => setServerVersion(d.version ?? null))
			.catch(() => setServerVersion(null));
	}, []);

	return (
		<div className="flex flex-col gap-5">
			<div className="dynround bg-background w-full h-50">
				<div className="flex gap-6 items-center justify-center w-full h-full">
					<img src="/icon.png" className="h-30" />
					<h1 className="text-7xl font-heading">Backupr</h1>
				</div>
			</div>
			<div className="flex items-center gap-1.5 text-[12px] text-muted-foreground/50 select-none font-mono justify-center">
				<span>web v{pkg.version}</span>
				{serverVersion !== null && (
					<>
						<span>·</span>
						<span>server v{serverVersion}</span>
					</>
				)}
			</div>
			<div>
				<h2 className="text-base font-semibold">{c.title}</h2>
				<p className="text-sm text-muted-foreground mt-1">{c.subtitle}</p>
			</div>

			<hr />

			<div>
				<h3 className="text-sm font-semibold">{c.whatIsTitle}</h3>
				<p className="text-sm text-muted-foreground mt-1">
					{c.whatIsParts.map((part, i) =>
						"bold" in part ? (
							<strong key={i}>{part.bold}</strong>
						) : "italic" in part ? (
							<em key={i}>{part.italic}</em>
						) : (
							<span key={i}>{part.rest}</span>
						),
					)}
				</p>
			</div>

			<div>
				<h3 className="text-sm font-semibold">{c.howTitle}</h3>
				<div className="flex flex-col gap-2 mt-2">
					{c.howItems.map((item) => (
						<p key={item.name} className="text-sm">
							<strong>{item.name}</strong>{" "}
							<span className="text-muted-foreground">- {item.desc}</span>
						</p>
					))}
				</div>
			</div>

			<hr />

			<div>
				<h3 className="text-sm font-semibold">{c.featuresTitle}</h3>
				<ul className="mt-2 flex flex-col gap-1 list-disc list-inside">
					{c.features.map((f) => (
						<li key={f} className="text-sm text-muted-foreground">
							{f}
						</li>
					))}
				</ul>
			</div>

			<p className="text-sm text-muted-foreground">
				<em>{c.nextSteps}</em>
			</p>

			<PageNav nextPage={nextPage} onNext={onNext} lang={lang} />
		</div>
	);
}
