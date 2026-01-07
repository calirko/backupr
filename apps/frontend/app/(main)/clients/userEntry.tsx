"use client";

import { userRoleDict } from "@controlegas/shared/enum/user";
import Cookies from "js-cookie";
import { Plus, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
// import { userRoleDict } from "@controlegas/shared/enum/user";
import CompanyCombobox from "@/components/comboBoxes/companyCombobox";
import ErrorMessage from "@/components/layout/errorMessage";
import FormPanel from "@/components/layout/formPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import InputPassword from "@/components/ui/inputPassword";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import Api from "@/lib/api";

export default function UserEntry({
	user_id,
	onCancel,
	onFinish,
}: {
	user_id?: string;
	onCancel?: () => void;
	onFinish?: () => void;
}) {
	const [loading, setLoading] = useState(() => !!user_id);
	const [form, setForm] = useState<Record<string, string | undefined | number>>(
		{
			name: "",
			email: "",
			password: "",
			confirmPassword: "",
			company_id: "",
			role: "USER",
		},
	);
	const [formErrors, setFormErrors] = useState<Record<string, string>>({});

	async function checkErrors() {
		const errors: Record<string, string> = {};
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

		if (!form.name) errors.name = "Nome é obrigatório";
		if (!form.email) errors.email = "Email é obrigatório";
		if (!emailRegex.test((form.email as string) || ""))
			errors.email = "Email inválido";

		if (!user_id) {
			// Password is required when creating a new user
			if (!form.password) errors.password = "Senha é obrigatória";
			if (!form.confirmPassword)
				errors.confirmPassword = "Confirmação de senha é obrigatória";
		}

		// Validate password match if either field is filled
		if (form.password || form.confirmPassword) {
			if (form.password !== form.confirmPassword)
				errors.confirmPassword = "Senhas não conferem";
		}

		if (form.password && (form.password as string).length < 6) {
			errors.password = "Senha deve ter no mínimo 6 caracteres";
		}

		if (!form.company_id) errors.company_id = "Empresa é obrigatória";

		if (!form.role) errors.role = "Cargo é obrigatório";

		setFormErrors(errors);
		return Object.keys(errors).length === 0;
	}

	async function finishEntry() {
		if (!(await checkErrors())) return;

		const data = {
			name: form.name,
			email: form.email,
			password: form.password || undefined,
			company_id: Number.parseInt(String(form.company_id), 10),
			role: form.role,
		};

		if (user_id) {
			await patchUser(data);
		} else {
			await postUser(data);
		}
	}

	async function patchUser(data: any) {
		try {
			await Api.patch(`/users/${user_id}`, data, {
				token: Cookies.get("token"),
			});

			toast.success("Usuário atualizado com sucesso");
			onFinish?.();
		} catch (error) {
			console.error(error);

			let message = (error as any)?.message || "Erro ao atualizar usuário";

			switch (message) {
				case "A user with this email already exists":
					setFormErrors({
						...formErrors,
						email: "Um usuário com este email já existe",
					});
					break;
				default:
					toast.error(message);
					break;
			}
		}
	}

	async function postUser(data: any) {
		try {
			await Api.post("/users", data, {
				token: Cookies.get("token"),
			});

			toast.success("Usuário criado com sucesso");
			onFinish?.();
		} catch (error) {
			console.error(error);

			let message = (error as any)?.message || "Erro ao atualizar usuário";

			switch (message) {
				case "A user with this email already exists":
					setFormErrors({
						...formErrors,
						email: "Um usuário com este email já existe",
					});
					break;
				default:
					toast.error(message);
					break;
			}
		}
	}

	async function fetchUser() {
		try {
			const response: any = await Api.get(`/users/${user_id}`, {
				token: Cookies.get("token"),
			});

			setForm({
				name: response.user.name,
				email: response.user.email,
				company_id: response.user.company_id,
				password: response.user.password,
				role: response.user.role,
			});
		} catch (error) {
			console.error(error);

			let message = (error as any)?.message || "Erro ao buscar usuário";

			if (message === "User not found") {
				toast.error("Usuário não encontrado");
				onCancel?.();
			} else {
				toast.error(message);
			}
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		if (user_id) fetchUser();
	}, [user_id]);

	return (
		<div className="flex flex-col gap-3 md:gap-4">
			<div className="flex gap-2">
				<Button onClick={finishEntry}>
					{user_id ? <Save /> : <Plus />}
					{user_id ? "Atualizar Usuário" : "Criar Usuário"}
				</Button>
				<Button variant={"outline"} onClick={onCancel}>
					<X /> Cancelar
				</Button>
			</div>
			{loading ? (
				<div className="h-40 flex justify-center items-center bg-background rounded-lg border">
					<Spinner />
				</div>
			) : (
				<>
					<FormPanel title="Dados do Usuário">
						<div>
							<Label required>Nome</Label>
							<Input
								type="text"
								value={form.name}
								placeholder="Nome Sobrenome"
								onChange={(e) => {
									setForm({ ...form, name: e.target.value });
									setFormErrors({ ...formErrors, name: "" });
								}}
								error={formErrors.name}
							/>
						</div>
						<div>
							<Label required>Email</Label>
							<Input
								type="email"
								value={form.email}
								placeholder="exemplo@email.com"
								onChange={(e) => {
									setForm({ ...form, email: e.target.value });
									setFormErrors({ ...formErrors, email: "" });
								}}
								error={formErrors.email}
							/>
						</div>
						<div>
							<Label required>Cargo</Label>
							<Select
								value={form.role as string}
								onValueChange={(value) => {
									setForm({ ...form, role: value });
									setFormErrors({ ...formErrors, role: "" });
								}}
							>
								<SelectTrigger className="w-full" error={formErrors.role}>
									<SelectValue placeholder="Selecione um cargo" />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(userRoleDict).map(([key, value]) => (
										<SelectItem key={key} value={key}>
											{value}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div>
							<Label required>Empresa</Label>
								<CompanyCombobox
									selected={String(form.company_id || "")}
									onSelectionChange={(e) => {
										setForm({ ...form, company_id: e });
										setFormErrors({ ...formErrors, company_id: "" });
									}}
								error={formErrors.company_id}
							/>
						</div>
					</FormPanel>
					<FormPanel title="Senha do Usuário">
						{user_id && (
							<ErrorMessage
								message="Somente preencha o campo de senha caso seja necessário alterar
                                                a senha."
							/>
						)}
						<div>
							<Label required={!user_id}>Senha</Label>
							<InputPassword
								value={form.password}
								onChange={(e) => {
									setForm({ ...form, password: e.target.value });
									setFormErrors({ ...formErrors, password: "" });
								}}
								error={formErrors.password}
							/>
						</div>
						<div>
							<Label required={!user_id}>Confirmar Senha</Label>
							<InputPassword
								value={form.confirmPassword}
								onChange={(e) => {
									setForm({ ...form, confirmPassword: e.target.value });
									setFormErrors({ ...formErrors, confirmPassword: "" });
								}}
								error={formErrors.confirmPassword}
							/>
						</div>
					</FormPanel>
				</>
			)}
		</div>
	);
}
