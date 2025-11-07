import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Settings } from "./components/Settings";
import { Backup } from "./components/Backup";
import { TitleBar } from "./components/TitleBar";
import { Toaster } from "./components/ui/toaster";
import { useToast } from "./components/ui/use-toast";

function App() {
	const { toasts } = useToast();

	return (
		<div className="h-screen bg-background flex flex-col">
			<TitleBar />
			<div className="flex-1 overflow-y-auto">
				<div>
					<div className="p-6 flex flex-col gap-6">
						<div className="flex gap-4 items-center">
							<img src="icon.png" alt="Backupr Logo" className="h-14 w-14" />
							<div>
								<h1 className="text-3xl font-bold">Backupr</h1>
								<p className="text-muted-foreground">Simple file backup tool</p>
							</div>
						</div>

						<Tabs defaultValue="backup" className="w-full flex flex-col gap-3">
							<TabsList className="grid w-full grid-cols-2">
								<TabsTrigger value="backup">Backup</TabsTrigger>
								<TabsTrigger value="settings">Settings</TabsTrigger>
							</TabsList>
							<TabsContent value="backup">
								<Backup />
							</TabsContent>
							<TabsContent value="settings">
								<Settings />
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
