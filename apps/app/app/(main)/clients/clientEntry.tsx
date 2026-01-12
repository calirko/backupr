"use client";

import FormPanel from "@/components/layout/formPanel";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import Api from "@/lib/api";
import Cookies from "js-cookie";
import { Plus, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function ClientEntry({
	client_id,
	onCancel,
	onFinish,
}: {
	client_id?: string;
	onCancel?: () => void;
	onFinish?: () => void;
}) {
	const [loading, setLoading] = useState(() => !!client_id);
	const [form, setForm] = useState<Record<string, string | undefined>>({
		name: "",
		email: "",
	});
	const [formErrors, setFormErrors] = useState<Record<string, string>>({});
	const [apiKeyDialog, setApiKeyDialog] = useState<{
		open: boolean;
		apiKey: string;
	}>({ open: false, apiKey: "" });

	async function checkErrors() {
		const errors: Record<string, string> = {};
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

		if (!form.name) errors.name = "Name is required";

		if (form.email && !emailRegex.test(form.email)) {
			errors.email = "Invalid email";
		}

		setFormErrors(errors);
		return Object.keys(errors).length === 0;
	}

	async function finishEntry() {
		if (!(await checkErrors())) return;

		const data = {
			name: form.name,
			email: form.email || undefined,
		};

		if (client_id) {
			await patchClient(data);
		} else {
			await postClient(data);
		}
	}

	async function patchClient(data: any) {
		try {
			await Api.patch(`/api/clients/${client_id}`, data, {
				token: Cookies.get("token"),
			});

			toast.success("Client updated successfully");
			onFinish?.();
		} catch (error) {
			console.error(error);

			let message = (error as any)?.message || "Error updating client";

			switch (message) {
				case "A client with this name already exists":
					setFormErrors({
						...formErrors,
						name: "A client with this name already exists",
					});
					break;
				default:
					toast.error(message);
					break;
			}
		}
	}

	async function postClient(data: any) {
		try {
			const response: any = await Api.post("/api/clients", data, {
				token: Cookies.get("token"),
			});

			toast.success("Client created successfully");

			// Show API key dialog
			if (response.client?.apiKey) {
				setApiKeyDialog({ open: true, apiKey: response.client.apiKey });
			} else {
				onFinish?.();
			}
		} catch (error) {
			console.error(error);

			let message = (error as any)?.message || "Error creating client";

			switch (message) {
				case "A client with this name already exists":
					setFormErrors({
						...formErrors,
						name: "A client with this name already exists",
					});
					break;
				default:
					toast.error(message);
					break;
			}
		}
	}

	async function fetchClient() {
		try {
			const response: any = await Api.get(`/api/clients/${client_id}`, {
				token: Cookies.get("token"),
			});

			setForm({
				name: response.client.name,
				email: response.client.email || "",
			});
		} catch (error) {
			console.error(error);

			let message = (error as any)?.message || "Error fetching client";

			if (message === "Client not found") {
				toast.error("Client not found");
				onCancel?.();
			} else {
				toast.error(message);
			}
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		if (client_id) fetchClient();
	}, [client_id]);

	return (
		<>
			<div className="flex flex-col gap-3 md:gap-4">
				<div className="flex gap-2">
					<Button onClick={finishEntry}>
						{client_id ? <Save /> : <Plus />}
						{client_id ? "Update Client" : "Create Client"}
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
					<FormPanel title="Client Information">
						<div>
							<Label required>Name</Label>
							<Input
								type="text"
								value={form.name}
								placeholder="Client Name"
								onChange={(e) => {
									setForm({ ...form, name: e.target.value });
									setFormErrors({ ...formErrors, name: "" });
								}}
								error={formErrors.name}
							/>
						</div>
						<div>
							<Label>Email</Label>
							<Input
								type="email"
								value={form.email}
								placeholder="client@example.com"
								onChange={(e) => {
									setForm({ ...form, email: e.target.value });
									setFormErrors({ ...formErrors, email: "" });
								}}
								error={formErrors.email}
							/>
						</div>
					</FormPanel>
				)}
			</div>

			<Dialog
				open={apiKeyDialog.open}
				onOpenChange={(open) => {
					setApiKeyDialog({ ...apiKeyDialog, open });
					if (!open) {
						onFinish?.();
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Client API Key</DialogTitle>
						<DialogDescription>
							Save this API key securely. You won't be able to see it again.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div>
							<Label>API Key</Label>
							<div className="relative">
								<Input
									type="text"
									value={apiKeyDialog.apiKey}
									readOnly
									className="font-mono text-sm"
								/>
								<Button
									size="sm"
									variant="outline"
									className="absolute right-2 top-1/2 -translate-y-1/2"
									onClick={() => {
										navigator.clipboard.writeText(apiKeyDialog.apiKey);
										toast.success("API key copied to clipboard");
									}}
								>
									Copy
								</Button>
							</div>
						</div>
						<Button
							className="w-full"
							onClick={() => {
								setApiKeyDialog({ ...apiKeyDialog, open: false });
								onFinish?.();
							}}
						>
							Done
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
