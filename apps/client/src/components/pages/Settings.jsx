import { Save, Server } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "../../hooks/use-toast";
import { Button } from "../ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { ThemeToggle } from "../ui/themeToggle";

export function SettingsPage() {
	const [settings, setSettings] = useState({
		serverHost: "",
		apiKey: "",
	});
	const [startupBehavior, setStartupBehavior] = useState({
		startInBackground: false,
	});

	// Load settings from store on mount
	useEffect(() => {
		const loadSettings = async () => {
			try {
				const savedSettings = (await window.store?.getAll()) || {};
				if (savedSettings.serverHost || savedSettings.apiKey) {
					setSettings({
						serverHost: savedSettings.serverHost || "",
						apiKey: savedSettings.apiKey || "",
					});
				}
				if (savedSettings.startInBackground !== undefined) {
					setStartupBehavior({
						startInBackground: savedSettings.startInBackground,
					});
				}
			} catch (e) {
				console.error("Failed to load settings:", e);
			}
		};
		loadSettings();
	}, []);

	function updateSetting(key, value) {
		setSettings((prev) => ({
			...prev,
			[key]: value,
		}));
	}

	function handleSave() {
		const saveSettings = async () => {
			try {
				await window.store?.set("serverHost", settings.serverHost);
				await window.store?.set("apiKey", settings.apiKey);
				await window.store?.set(
					"startInBackground",
					startupBehavior.startInBackground,
				);

				// Apply auto-launch setting
				if (startupBehavior.startInBackground) {
					await window.electron.ipcRenderer.invoke("auto-launch-enable");
				} else {
					await window.electron.ipcRenderer.invoke("auto-launch-disable");
				}

				toast({
					title: "Settings saved!",
					description: "Your settings have been updated successfully.",
				});
			} catch (e) {
				console.error("Failed to save settings:", e);
				toast({
					title: "Error",
					description: "Failed to save settings",
					variant: "destructive",
				});
			}
		};
		saveSettings();
	}

	async function handleTestConnection() {
		try {
			const response = await fetch(`${settings.serverHost}/api/ping`, {
				method: "GET",
				headers: {
					"X-API-Key": settings.apiKey,
				},
			});

			if (response.status === 401) {
				alert("Unauthorized: Please check your API key.");
				return;
			}

			if (response.ok) {
				const data = await response.json();
				toast({
					title: "Connection successful!",
					description: data.message || "Your settings are correct.",
				});
			} else {
				const errorData = await response.json();
				alert(`Connection failed: ${errorData.message || response.statusText}`);
			}
		} catch (error) {
			console.error("Error testing connection:", error);
			alert(`Connection error: ${error.message}`);
		}
	}

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
					<Button onClick={handleTestConnection} className="w-full">
						<Server className="h-4" />
						Test Connection
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
					<CardTitle>Startup Behavior</CardTitle>
					<CardDescription>
						Control how the application starts with your system
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center space-x-2">
						<input
							type="checkbox"
							id="startInBackground"
							checked={startupBehavior.startInBackground}
							onChange={(e) =>
								setStartupBehavior((prev) => ({
									...prev,
									startInBackground: e.target.checked,
								}))
							}
							className="w-4 h-4 rounded"
						/>
						<Label htmlFor="startInBackground" className="cursor-pointer">
							Launch at system startup
						</Label>
					</div>
					<p className="text-sm text-muted-foreground">
						When enabled, Backupr will automatically start with your system and
						run in the background. The app will be minimized to the system tray
						and you can click the tray icon to show or hide the window. This
						ensures your scheduled backups run automatically.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Local Data</CardTitle>
					<CardDescription>
						Electron data is automatically managed
					</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						The local data is used to store sync history and backup
						configurations. It's automatically created and managed by the
						application.
					</p>
				</CardContent>
			</Card>

			<div className="flex justify-end w-full">
				<Button onClick={handleSave} className="w-full">
					<Save className="h-4" />
					Save Settings
				</Button>
			</div>
		</div>
	);
}
