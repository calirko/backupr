import type { WikiLang } from "@/components/dialog/wiki/wiki";
import {
	Eye,
	FloppyDisk,
	Pencil,
	Plus,
	UserCircle,
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
		title: "Managing Users",
		subtitle: "How to create, update, and remove user accounts.",
		overviewTitle: "Overview",
		overviewDesc:
			"The Users page lists all accounts registered in the system. Each row shows the user's name, username, email, and when the account was created or last updated. You can sort the table by any column and filter by name, username, email, or date range.",
		createTitle: "Creating a user",
		createDesc:
			'Click the "New User" button in the top-right corner of the Users page to open the Add User dialog.',
		createFields: [
			{ label: "Name", note: "The user's display name." },
			{ label: "Username", note: "Used to log in. Must be unique." },
			{ label: "Email", note: "Contact email. Must be unique." },
			{ label: "Password", note: "Required on creation." },
		],
		createAction: 'Click "Add" to create the account.',
		viewTitle: "Viewing a user",
		viewDesc:
			'Click the eye icon on any row to open the user in read-only mode. All fields are visible but not editable.',
		editTitle: "Editing a user",
		editDesc:
			'Click the pencil icon on any row to open the Edit User dialog. You can update the name, username, email, or password.',
		editPasswordNote:
			"Leave the password field empty to keep the current password. Only fill it in if you want to set a new one.",
		editAction: 'Click "Save" to apply the changes.',
		deleteTitle: "Deleting a user",
		deleteDesc:
			'Click the delete icon on any row (under the "Dangerous" section of the row menu). A confirmation dialog will appear before the account is permanently removed.',
		deleteWarning: "Deletion is permanent and cannot be undone.",
	},
	"pt-br": {
		title: "Gerenciando Usuários",
		subtitle: "Como criar, atualizar e remover contas de usuário.",
		overviewTitle: "Visão geral",
		overviewDesc:
			"A página de Usuários lista todas as contas registradas no sistema. Cada linha exibe o nome, nome de usuário, email e quando a conta foi criada ou atualizada pela última vez. Você pode ordenar a tabela por qualquer coluna e filtrar por nome, nome de usuário, email ou intervalo de datas.",
		createTitle: "Criando um usuário",
		createDesc:
			'Clique no botão "Novo Usuário" no canto superior direito da página de Usuários para abrir o diálogo de Adicionar Usuário.',
		createFields: [
			{ label: "Nome", note: "Nome de exibição do usuário." },
			{ label: "Nome de usuário", note: "Usado para login. Deve ser único." },
			{ label: "Email", note: "Email de contato. Deve ser único." },
			{ label: "Senha", note: "Obrigatória na criação." },
		],
		createAction: 'Clique em "Adicionar" para criar a conta.',
		viewTitle: "Visualizando um usuário",
		viewDesc:
			"Clique no ícone de olho em qualquer linha para abrir o usuário em modo somente leitura. Todos os campos são visíveis, mas não editáveis.",
		editTitle: "Editando um usuário",
		editDesc:
			"Clique no ícone de lápis em qualquer linha para abrir o diálogo de Editar Usuário. Você pode atualizar o nome, nome de usuário, email ou senha.",
		editPasswordNote:
			"Deixe o campo de senha vazio para manter a senha atual. Preencha apenas se quiser definir uma nova.",
		editAction: 'Clique em "Salvar" para aplicar as alterações.',
		deleteTitle: "Excluindo um usuário",
		deleteDesc:
			'Clique no ícone de exclusão em qualquer linha (na seção "Perigoso" do menu da linha). Um diálogo de confirmação será exibido antes que a conta seja removida permanentemente.',
		deleteWarning: "A exclusão é permanente e não pode ser desfeita.",
	},
};

function MockInput({
	label,
	placeholder,
	type = "text",
}: {
	label: string;
	placeholder: string;
	type?: string;
}) {
	return (
		<div className="flex flex-col gap-1 w-full">
			<label className="text-xs font-medium">{label}</label>
			<div className="border rounded-md px-3 py-1.5 text-xs text-muted-foreground bg-background w-full">
				{type === "password" ? "••••••••" : placeholder}
			</div>
		</div>
	);
}

export function ManagingUsersPage({ nextPage, onNext, lang }: Props) {
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

				{/* New User button mockup */}
				<div className="dynround w-full min-h-20 flex items-center justify-center">
					<button
						type="button"
						className="inline-flex items-center gap-1.5 rounded-md border bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 pointer-events-none"
					>
						<Plus size={13} weight="bold" />
						{lang === "en" ? "New User" : "Novo Usuário"}
					</button>
				</div>

				{/* Add User dialog mockup */}
				<div className="dynround w-full min-h-20 flex items-center justify-center">
					<div className="border rounded-lg bg-background shadow-sm p-4 w-72 flex flex-col gap-3">
						<div>
							<p className="text-xs font-semibold">
								{lang === "en" ? "Add User" : "Adicionar Usuário"}
							</p>
							<p className="text-xs text-muted-foreground">
								{lang === "en" ? "Add a new user." : "Adicione um novo usuário."}
							</p>
						</div>
						<MockInput
							label={c.createFields[0].label}
							placeholder={c.createFields[0].label}
						/>
						<MockInput
							label={c.createFields[1].label}
							placeholder={c.createFields[1].label}
						/>
						<MockInput
							label={c.createFields[2].label}
							placeholder={c.createFields[2].label}
						/>
						<MockInput
							label={c.createFields[3].label}
							placeholder={c.createFields[3].label}
							type="password"
						/>
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
								{lang === "en" ? "Add" : "Adicionar"}
							</button>
						</div>
					</div>
				</div>

				<ul className="flex flex-col gap-1 list-disc list-inside">
					{c.createFields.map((f) => (
						<li key={f.label} className="text-sm text-muted-foreground">
							<strong>{f.label}</strong> — {f.note}
						</li>
					))}
				</ul>
				<p className="text-sm text-muted-foreground">
					<em>{c.createAction}</em>
				</p>
			</div>

			<hr />

			{/* View */}
			<div className="flex flex-col gap-3">
				<div>
					<h3 className="text-sm font-semibold">{c.viewTitle}</h3>
					<p className="text-sm text-muted-foreground mt-1">{c.viewDesc}</p>
				</div>

				<div className="dynround w-full min-h-20 flex items-center justify-center gap-3">
					<button
						type="button"
						className="inline-flex items-center gap-1.5 rounded-md border text-xs font-medium px-3 py-1.5 pointer-events-none"
					>
						<Eye size={13} />
						{lang === "en" ? "View" : "Ver"}
					</button>

					<div className="border rounded-lg bg-background shadow-sm p-4 w-64 flex flex-col gap-3">
						<div>
							<p className="text-xs font-semibold">
								{lang === "en" ? "View User" : "Ver Usuário"}
							</p>
							<p className="text-xs text-muted-foreground">
								{lang === "en"
									? "Viewing user details."
									: "Visualizando detalhes do usuário."}
							</p>
						</div>
						<div className="flex flex-col gap-2">
							{[
								{ label: lang === "en" ? "Name" : "Nome", val: "John Doe" },
								{ label: lang === "en" ? "Username" : "Usuário", val: "johndoe" },
								{ label: "Email", val: "john@example.com" },
							].map((f) => (
								<div key={f.label} className="flex flex-col gap-0.5">
									<span className="text-xs font-medium">{f.label}</span>
									<div className="border rounded-md px-3 py-1.5 text-xs text-muted-foreground bg-muted/40">
										{f.val}
									</div>
								</div>
							))}
						</div>
						<div className="flex justify-end">
							<button
								type="button"
								className="inline-flex items-center gap-1.5 rounded-md border text-xs font-medium px-3 py-1.5 pointer-events-none"
							>
								<XSquare size={13} />
								{lang === "en" ? "Close" : "Fechar"}
							</button>
						</div>
					</div>
				</div>
			</div>

			<hr />

			{/* Edit */}
			<div className="flex flex-col gap-3">
				<div>
					<h3 className="text-sm font-semibold">{c.editTitle}</h3>
					<p className="text-sm text-muted-foreground mt-1">{c.editDesc}</p>
				</div>

				<div className="dynround w-full min-h-20 flex items-center justify-center gap-3">
					<button
						type="button"
						className="inline-flex items-center gap-1.5 rounded-md border text-xs font-medium px-3 py-1.5 pointer-events-none"
					>
						<Pencil size={13} />
						{lang === "en" ? "Edit" : "Editar"}
					</button>

					<div className="border rounded-lg bg-background shadow-sm p-4 w-64 flex flex-col gap-3">
						<div>
							<p className="text-xs font-semibold">
								{lang === "en" ? "Edit User" : "Editar Usuário"}
							</p>
						</div>
						<MockInput
							label={lang === "en" ? "Name" : "Nome"}
							placeholder="John Doe"
						/>
						<MockInput
							label={lang === "en" ? "Password" : "Senha"}
							placeholder={
								lang === "en"
									? "Leave empty to keep current"
									: "Deixe vazio para manter"
							}
							type="password"
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

				<p className="text-sm text-muted-foreground">
					<em>{c.editPasswordNote}</em>
				</p>
				<p className="text-sm text-muted-foreground">{c.editAction}</p>
			</div>

			<hr />

			{/* Delete */}
			<div className="flex flex-col gap-3">
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

				<p className="text-sm text-destructive font-medium">
					<em>{c.deleteWarning}</em>
				</p>
			</div>

			<div className="dynround w-full min-h-20 flex items-center justify-center gap-3">
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<div className="flex items-center gap-1.5 border rounded-md px-2 py-1">
						<UserCircle size={14} />
						<span>johndoe</span>
					</div>
					<span className="text-muted-foreground/50">john@example.com</span>
					<button
						type="button"
						className="inline-flex items-center gap-1 rounded-md border px-2 py-1 pointer-events-none"
					>
						<Eye size={12} />
					</button>
					<button
						type="button"
						className="inline-flex items-center gap-1 rounded-md border px-2 py-1 pointer-events-none"
					>
						<Pencil size={12} />
					</button>
					<button
						type="button"
						className="inline-flex items-center gap-1 rounded-md border border-destructive text-destructive px-2 py-1 pointer-events-none"
					>
						<XSquare size={12} />
					</button>
				</div>
			</div>

			<PageNav nextPage={nextPage} onNext={onNext} lang={lang} />
		</div>
	);
}
