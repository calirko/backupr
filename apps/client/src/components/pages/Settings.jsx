import { Plug, RefreshCw, Save, Server, ServerOff } from "lucide-react";
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
		wsServiceUrl: "",
	});
	const [startupBehavior, setStartupBehavior] = useState({
		startInBackground: false,
	});
	const [wsStatus, setWsStatus] = useState("disconnected"); // "connected" | "connecting" | "disconnected"
	const [reconnecting, setReconnecting] = useState(false);

	// Load settings from store on mount
	useEffect(() => {
		const loadSettings = async () => {
			try {
				const savedSettings = (await window.store?.getAll()) || {};
				if (
					savedSettings.serverHost ||
					savedSettings.apiKey ||
					savedSettings.wsServiceUrl
				) {
					setSettings({
						serverHost: savedSettings.serverHost || "",
						apiKey: savedSettings.apiKey || "",
						wsServiceUrl: savedSettings.wsServiceUrl || "",
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

		// Fetch initial WS status and subscribe to live updates
		window.electron
			?.getWsStatus()
			.then(setWsStatus)
			.catch(() => {});
		const unsub = window.electron?.ipcRenderer.on("ws-status", setWsStatus);
		return () => unsub?.();
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
				await window.store?.set("wsServiceUrl", settings.wsServiceUrl);
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

				// Force-reconnect with the new settings (guarded against active backups)
				await _doReconnect({ silent: true });
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

	async function _doReconnect({ silent = false } = {}) {
		setReconnecting(true);
		try {
			const result = await window.electron?.wsReconnect();
			if (!result?.ok && !silent) {
				toast({
					title: "Cannot reconnect",
					description: result?.reason || "Unknown error",
					variant: "destructive",
				});
			}
		} catch (e) {
			if (!silent) {
				toast({
					title: "Reconnect failed",
					description: e.message,
					variant: "destructive",
				});
			}
		} finally {
			setReconnecting(false);
		}
	}

	function handleReconnect() {
		_doReconnect();
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
		<div className="space-y-4">
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
					<div className="space-y-2">
						<Label htmlFor="wsServiceUrl">WebSocket Service URL</Label>
						<Input
							id="wsServiceUrl"
							placeholder="http://localhost:4001 (leave blank to auto-derive from Server Host)"
							value={settings.wsServiceUrl}
							onChange={(e) => updateSetting("wsServiceUrl", e.target.value)}
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
						<Plug className="h-4" />
						Test Connection
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Server Connection</CardTitle>
					<CardDescription>
						Live WebSocket connection status for real-time backup sync
					</CardDescription>
				</CardHeader>
				<CardContent className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-2">
						{wsStatus === "connected" ? (
							<Server className="h-5 w-5 text-green-500" />
						) : (
							<ServerOff className="h-5 w-5 text-muted-foreground" />
						)}
						<span
							className={
								wsStatus === "connected"
									? "text-sm font-medium text-green-500"
									: wsStatus === "connecting"
										? "text-sm font-medium text-amber-500"
										: "text-sm font-medium text-muted-foreground"
							}
						>
							{wsStatus === "connected"
								? "Connected"
								: wsStatus === "connecting"
									? "Connecting…"
									: "Disconnected"}
						</span>
					</div>
					<Button
						variant="outline"
						size="sm"
						disabled={reconnecting || wsStatus === "connected"}
						onClick={handleReconnect}
					>
						<RefreshCw
							className={`h-4 w-4 ${reconnecting ? "animate-spin" : ""}`}
						/>
						{reconnecting ? "Reconnecting…" : "Reconnect"}
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
							className="w-4 h-4 rounded-0"
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

			<div className="flex justify-end w-full">
				<Button onClick={handleSave} className="w-full">
					<Save className="h-4" />
					Save Settings
				</Button>
			</div>
		</div>
	);
}
