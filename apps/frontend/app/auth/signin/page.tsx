"use client";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox, CheckboxWrapper } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import InputPassword from "@/components/ui/input-password";
import { Label } from "@/components/ui/label";
import Api, { FetchError } from "@/lib/api";
import Cookies from "js-cookie";
import { DoorOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function SignInPage() {
	const [form, setForm] = useState({
		email: "",
		password: "",
		rememberMe: false,
	});
	const [formErrors, setFormErrors] = useState({ email: "", password: "" });
	const [loading, setLoading] = useState(false);
	const router = useRouter();

	function validateForm() {
		let valid = true;
		const errors = { email: "", password: "" };

		if (!form.email) {
			errors.email = "Email é obrigatório";
			valid = false;
		} else if (!/\S+@\S+\.\S+/.test(form.email)) {
			errors.email = "Email é inválido";
			valid = false;
		}

		if (!form.password) {
			errors.password = "Senha é obrigatória";
			valid = false;
		} else if (form.password.length < 6) {
			errors.password = "Senha deve ter ao menos 6 caracteres";
			valid = false;
		}

		setFormErrors(errors);
		return valid;
	}

	async function handleSignIn(event: React.FormEvent) {
		event?.preventDefault();

		if (!validateForm()) return;
		setLoading(true);

		try {
			const data = await Api.post("/api/auth/signin", form);
			const token = (data as { token: string }).token;

			if (form.rememberMe) {
				Cookies.set("token", token, { expires: 7, sameSite: "lax" });
			} else {
				Cookies.set("token", token, { sameSite: "lax" });
			}
			router.push("/home");
		} catch (error: any) {
			console.error("Error during sign-in:", error);
			if (error instanceof FetchError) {
				const maybeData = error.data as unknown;
				const obj = maybeData as Record<string, unknown> | null;
				const msg =
					obj && typeof obj.message === "string"
						? (obj.message as string)
						: error.message;

				switch (msg) {
					case "user not found":
						setFormErrors((prev) => ({
							...prev,
							email: "Usuário não encontrado",
						}));
						break;
					case "invalid password":
						setFormErrors((prev) => ({
							...prev,
							password: "A senha está incorreta",
						}));
						break;
					default:
						toast.error(msg || "Um erro ocorreu ao entrar");
						break;
				}
			} else if (error instanceof Error) {
				toast.error(error.message || "Um erro ocorreu ao entrar");
			} else {
				toast.error("Um erro ocorreu ao entrar");
			}
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="h-full w-full">
			<div className="w-full h-full flex items-center justify-center bg-striped">
				<Card className="w-[450px]">
					<CardHeader>
						<CardTitle>Entrar</CardTitle>
						<CardDescription>
							Entre com sua conta para continuar.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleSignIn}>
							<div className="flex flex-col gap-6">
								<div className="flex flex-col gap-4">
									<div>
										<Label htmlFor="email">Email</Label>
										<Input
											placeholder="exemplo@email.com"
											type="email"
											value={form.email}
											onChange={(e) => {
												setForm({ ...form, email: e.target.value });
												setFormErrors({ ...formErrors, email: "" });
											}}
											error={formErrors.email}
										/>
									</div>
									<div>
										<Label htmlFor="password">Senha</Label>
										<InputPassword
											value={form.password}
											onChange={(e) => {
												setForm({ ...form, password: e.target.value });
												setFormErrors({ ...formErrors, password: "" });
											}}
											error={formErrors.password}
										/>
									</div>
									<div className="flex items-center gap-2 w-full">
										<CheckboxWrapper className="w-full">
											<Checkbox
												id="rememberMe"
												checked={form.rememberMe}
												onCheckedChange={(e) =>
													setForm({
														...form,
														rememberMe: e as boolean,
													})
												}
											/>
											<Label htmlFor="rememberMe" className="mb-0">
												Lembrar-me
											</Label>
										</CheckboxWrapper>
									</div>
								</div>
								<Button className="w-full" disabled={loading}>
									<DoorOpen />
									Entrar
								</Button>
							</div>
						</form>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
