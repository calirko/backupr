"use client";

import Cookies from "js-cookie";
import { Plus, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import FormPanel from "@/components/layout/formPanel";
import ErrorMessage from "@/components/layout/errorMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import InputPassword from "@/components/ui/inputPassword";
import { Label } from "@/components/ui/label";
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
	const [form, setForm] = useState<Record<string, string | undefined>>({
		name: "",
		email: "",
		password: "",
		confirmPassword: "",
	});
	const [formErrors, setFormErrors] = useState<Record<string, string>>({});

	async function checkErrors() {
		const errors: Record<string, string> = {};
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

		if (!form.name) errors.name = "Name is required";
		if (!form.email) errors.email = "Email is required";
		if (!emailRegex.test((form.email as string) || ""))
			errors.email = "Invalid email";

		if (!user_id) {
			// Password is required when creating a new user
			if (!form.password) errors.password = "Password is required";
			if (!form.confirmPassword)
				errors.confirmPassword = "Password confirmation is required";
		}

		// Validate password match if either field is filled
		if (form.password || form.confirmPassword) {
			if (form.password !== form.confirmPassword)
				errors.confirmPassword = "Passwords do not match";
		}

		if (form.password && (form.password as string).length < 6) {
			errors.password = "Password must be at least 6 characters";
		}

		setFormErrors(errors);
		return Object.keys(errors).length === 0;
	}

	async function finishEntry() {
		if (!(await checkErrors())) return;

		const data = {
			name: form.name,
			email: form.email,
			password: form.password || undefined,
		};

		if (user_id) {
			await patchUser(data);
		} else {
			await postUser(data);
		}
	}

	async function patchUser(data: any) {
		try {
			await Api.patch(`/api/users/${user_id}`, data, {
				token: Cookies.get("token"),
			});

			toast.success("User updated successfully");
			onFinish?.();
		} catch (error) {
			console.error(error);

			let message = (error as any)?.message || "Error updating user";

			switch (message) {
				case "A user with this email already exists":
					setFormErrors({
						...formErrors,
						email: "A user with this email already exists",
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
			await Api.post("/api/users", data, {
				token: Cookies.get("token"),
			});

			toast.success("User created successfully");
			onFinish?.();
		} catch (error) {
			console.error(error);

			let message = (error as any)?.message || "Error creating user";

			switch (message) {
				case "A user with this email already exists":
					setFormErrors({
						...formErrors,
						email: "A user with this email already exists",
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
			const response: any = await Api.get(`/api/users/${user_id}`, {
				token: Cookies.get("token"),
			});

			setForm({
				name: response.user.name,
				email: response.user.email,
				password: "",
				confirmPassword: "",
			});
		} catch (error) {
			console.error(error);

			let message = (error as any)?.message || "Error fetching user";

			if (message === "User not found") {
				toast.error("User not found");
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
					{user_id ? "Update User" : "Create User"}
				</Button>
				<Button variant={"outline"} onClick={onCancel}>
					<X /> Cancel
				</Button>
			</div>
			{loading ? (
				<div className="h-40 flex justify-center items-center bg-background rounded-lg border">
					<Spinner />
				</div>
			) : (
				<>
					<FormPanel title="User Information">
						<div>
							<Label required>Name</Label>
							<Input
								type="text"
								value={form.name}
								placeholder="Full Name"
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
								placeholder="user@example.com"
								onChange={(e) => {
									setForm({ ...form, email: e.target.value });
									setFormErrors({ ...formErrors, email: "" });
								}}
								error={formErrors.email}
							/>
						</div>
					</FormPanel>
					<FormPanel title="User Password">
						{user_id && (
							<ErrorMessage message="Only fill in the password field if you need to change the password." />
						)}
						<div>
							<Label required={!user_id}>Password</Label>
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
							<Label required={!user_id}>Confirm Password</Label>
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
