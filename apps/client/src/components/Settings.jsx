import React, { useState, useEffect } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./ui/card";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { ThemeToggle } from "../components/ThemeToggle";
import { useToast } from "./ui/use-toast";

export function Settings() {
	const [settings, setSettings] = useState({
		serverHost: "",
		apiKey: "",
	});
	const [saved, setSaved] = useState(false);
	const [testing, setTesting] = useState(false);
	const { toast } = useToast();

	useEffect(() => {
		loadSettings();
	}, []);

	const loadSettings = async () => {
		if (window.electron) {
			const data = await window.electron.getSettings();
			setSettings(data);
		}
	};

	const handleSave = async () => {
		if (window.electron) {
			await window.electron.saveSettings(settings);
			setSaved(true);
			setTimeout(() => setSaved(false), 2000);
		}
	};

	const updateSetting = (field, value) => {
		setSettings((prev) => ({
			...prev,
			[field]: value,
		}));
	};

	const handleTestConnection = async () => {
		if (!settings.serverHost || !settings.apiKey) {
			toast({
				title: "Missing Information",
				description: "Please enter both server host and API key",
				variant: "destructive",
			});
			return;
		}

		setTesting(true);
		try {
			const response = await fetch(`${settings.serverHost}/api/ping`, {
				method: "GET",
				headers: {
					"X-API-Key": settings.apiKey,
				},
			});

			const data = await response.json();

			if (response.ok) {
				toast({
					title: "Connection Successful",
					description: `Connected to server as ${data.clientName}`,
				});
			} else {
				toast({
					title: "Connection Failed",
					description: data.error || "Unable to connect to server",
					variant: "destructive",
				});
			}
		} catch (error) {
			toast({
				title: "Connection Error",
				description: error.message || "Failed to connect to server",
				variant: "destructive",
			});
		} finally {
			setTesting(false);
		}
	};

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Server Settings</CardTitle>
					<CardDescription>
						Configure your backup server connection
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="serverHost">Server Host</Label>
						<Input
							id="serverHost"
							placeholder="http://localhost:3000"
							value={settings.serverHost}
							onChange={(e) => updateSetting("serverHost", e.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="apiKey">API Key</Label>
						<Input
							id="apiKey"
							type="password"
							placeholder="Your API key"
							value={settings.apiKey}
							onChange={(e) => updateSetting("apiKey", e.target.value)}
						/>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Test Connection</CardTitle>
					<CardDescription>
						Test your server settings before saving
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						onClick={handleTestConnection}
						disabled={testing || !settings.serverHost || !settings.apiKey}
						className="w-full"
					>
						{testing ? "Testing..." : "Test Connection"}
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Theme</CardTitle>
					<CardDescription>Choose between light and dark mode</CardDescription>
				</CardHeader>
				<CardContent>
					<ThemeToggle />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Local Database</CardTitle>
					<CardDescription>
						SQLite database is automatically managed in your application data
						folder
					</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						The local database is used to store sync history and backup
						configurations. It's automatically created and managed by the
						application.
					</p>
				</CardContent>
			</Card>

			<div className="flex justify-end">
				<Button onClick={handleSave}>
					{saved ? "Settings Saved!" : "Save Settings"}
				</Button>
			</div>
		</div>
	);
}
