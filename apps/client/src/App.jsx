import { Cog, RefreshCcw } from "lucide-react";
import { BackupPage } from "./components/pages/Backup";
import { SettingsPage } from "./components/pages/Settings";
import { TitleBar } from "./components/TitleBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Toaster } from "./components/ui/toaster";
import { useToast } from "./hooks/use-toast";

function App() {
	const { toasts } = useToast();

	return (
		<div className="h-screen bg-background flex flex-col">
			<TitleBar />
			<div className="flex-1 overflow-y-auto">
				<div>
					<div className="p-6 flex flex-col gap-6">
						<div className="flex gap-4 items-center">
							<img
								src="/icons/icon.png"
								alt="Backupr Logo"
								className="h-14 w-14"
							/>
							<div>
								<h1 className="text-3xl font-black">Backupr</h1>
								<p className="text-muted-foreground">Simple file backup tool</p>
							</div>
						</div>

						<Tabs defaultValue="backup" className="w-full flex flex-col gap-3">
							<TabsList className="grid w-full grid-cols-2">
								<TabsTrigger value="backup">
									<RefreshCcw className="h-4" />
									Backup
								</TabsTrigger>
								<TabsTrigger value="settings">
									<Cog className="h-4" />
									Settings
								</TabsTrigger>
							</TabsList>
							<TabsContent value="backup">
								<BackupPage />
							</TabsContent>
							<TabsContent value="settings">
								<SettingsPage />
							</TabsContent>
						</Tabs>
					</div>
				</div>
			</div>
			<Toaster toasts={toasts} />
		</div>
	);
}

export default App;
