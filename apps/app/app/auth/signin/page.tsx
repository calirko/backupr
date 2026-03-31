"use client";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import InputPassword from "@/components/ui/input-password";
import { Label } from "@/components/ui/label";
import Api from "@/lib/api";
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
			errors.email = "Email is required";
			valid = false;
		} else if (!/\S+@\S+\.\S+/.test(form.email)) {
			errors.email = "The email is invalid";
			valid = false;
		}

		if (!form.password) {
			errors.password = "Password is required";
			valid = false;
		} else if (form.password.length < 6) {
			errors.password = "The password must be at least 6 characters";
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
			const maybeData = error.data as unknown;
			const obj = maybeData as Record<string, unknown> | null;
			const msg =
				obj && typeof obj.message === "string"
					? (obj.message as string)
					: error.message;

			console.error("Error message:", error.message);

			switch (msg) {
				case "user not found":
					setFormErrors((prev) => ({
						...prev,
						email: "User with this email does not exist",
					}));
					break;
				case "invalid password":
					setFormErrors((prev) => ({
						...prev,
						password: "The password is incorrect",
					}));
					break;
				default:
					toast.error(msg || "An error occurred during sign-in");
					break;
			}
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="h-full w-full">
			<div className="flex-col gap-10 w-full h-full flex items-center justify-center ">
				<div className="flex items-center gap-4">
					<div>
						<img src={"/icon.png"} className="h-full p-2 h-30 w-30" />
					</div>
					<div className="space-y-2">
						<h1 className="font-black text-5xl">Backupr</h1>
						<p className="text-muted-foreground">Simple file backup tool.</p>
					</div>
				</div>

				<Card className="w-112.5">
					<CardHeader>
						<CardTitle>Login</CardTitle>
						<CardDescription>
							Enter your email and password to access your account.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleSignIn}>
							<div className="flex flex-col gap-6">
								<div className="flex flex-col gap-4">
									<div>
										<Label htmlFor="email">Email</Label>
										<Input
											placeholder="example@backupr.local"
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
										<Label htmlFor="password">Password</Label>
										<InputPassword
											value={form.password}
											onChange={(e) => {
												setForm({ ...form, password: e.target.value });
												setFormErrors({ ...formErrors, password: "" });
											}}
											error={formErrors.password}
										/>
									</div>
								</div>
								<div className="flex items-center gap-2 w-full">
									<div className="flex gap-2 grow">
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
									</div>
									<Button disabled={loading} className="h-9">
										<DoorOpen />
										Entrar
									</Button>
								</div>
							</div>
						</form>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
