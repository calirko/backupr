import { SignInIcon } from "@phosphor-icons/react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputPassword } from "@/components/ui/input-password";

export default function LoginPage() {
	const navigate = useNavigate();

	if (localStorage.getItem("token")) {
		return <Navigate to="/dashboard" replace />;
	}

	async function onSubmit(form: React.SubmitEvent<HTMLFormElement>) {
		form.preventDefault();
		const data = new FormData(form.currentTarget);
		const emailOrUsername = data.get("emailOrUsername") as string;
		const password = data.get("password") as string;

		if (!emailOrUsername || !password) {
			toast.error("Please fill in all fields", {
				description: "Both username/email and password are required",
			});
			return;
		}

		await requestLogin(emailOrUsername, password);
	}

	async function requestLogin(emailOrUsername: string, password: string) {
		try {
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ emailOrUsername, password }),
			});
			const data = await response.json();

			if (response.ok) {
				toast.success("Logged in successfully", {
					description: data.message,
				});

				const { token } = data;
				localStorage.setItem("token", token);
				navigate("/dashboard");
			} else {
				toast.error("Login failed", {
					description: data.error,
				});
				console.error(data.error);
			}
		} catch (error) {
			toast.error("An error occurred", {
				description: error instanceof Error ? error.message : String(error),
			});
			console.error(error);
		}
	}

	return (
		<div className="flex w-full h-full items-center justify-center lg:p-6">
			<div className="flex w-full h-full lg:max-w-6xl lg:max-h-176 lg:grid lg:grid-cols-[3fr_2fr] lg:grid-rows-1 lg:overflow-hidden dynround lg:bg-card lg:border">
				<img
					src="/login.webp"
					alt=""
					className="hidden lg:block h-full w-full object-cover"
				/>
				<div className="flex w-full h-full items-center justify-center flex-col gap-10 lg:px-8">
					<div className="flex gap-6 items-center">
						<img src="/icon.png" className="h-24 sm:h-30 lg:h-20 2xl:h-24" />
						<h1 className="text-5xl sm:text-7xl lg:text-5xl 2xl:text-6xl font-heading">
							Backupr
						</h1>
					</div>
					<Card className="w-full max-w-sm lg:ring-0 lg:border-0 lg:bg-transparent">
						<CardHeader>
							<CardTitle>Login to your account</CardTitle>
							<CardDescription>
								Enter your username or email below to login to your account
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form onSubmit={onSubmit} id="login-form">
								<div className="flex flex-col gap-6">
									<div className="grid gap-2">
										<Label htmlFor="emailOrUsername">Username or Email</Label>
										<Input
											id="emailOrUsername"
											name="emailOrUsername"
											type="text"
											placeholder="username or email@example.com"
											required
										/>
									</div>
									<div className="grid gap-2">
										<div className="flex items-center">
											<Label htmlFor="password">Password</Label>
										</div>
										<InputPassword
											name="password"
											type="password"
											placeholder="Password"
											required
										/>
									</div>
								</div>
							</form>
						</CardContent>
						<div className="flex flex-col gap-2 px-4">
							<Button type="submit" className="w-full" form="login-form">
								<SignInIcon />
								Login
							</Button>
						</div>
					</Card>
					<p className="text-xs text-muted-foreground">
						Developed and designed by{" "}
						<a href="https://github.com/calirko" className="underline">
							calirko
						</a>
					</p>
				</div>
			</div>
		</div>
	);
}
