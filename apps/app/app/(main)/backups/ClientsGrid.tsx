import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ConnectionIcon, formatBytes } from "./helpers";
import type { Client, ClientState } from "./types";

interface Props {
	clients: Client[];
	clientStates: Map<string, ClientState>;
	onSelectClient: (clientId: string) => void;
}

export default function ClientsGrid({
	clients,
	clientStates,
	onSelectClient,
}: Props) {
	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3 border bg-card p-3">
				<Button variant="outline" disabled>
					<ChevronDown className="h-4 w-4 rotate-90" />
				</Button>
				<h2 className="font-semibold flex items-center gap-2">Clients</h2>
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				{clients.map((client) => {
					const cs = clientStates.get(client.id);
					const isConnected = cs?.connected ?? false;
					const activeBackup = cs?.activeBackup ?? null;
					const lastError = cs?.lastError ?? null;
					const lastCompleted = cs?.lastCompleted ?? null;
					const clientConnectionStatus = isConnected
						? activeBackup
							? activeBackup.status
							: "idle"
						: "disconnected";
					return (
						<Card
							key={client.id}
							className="cursor-pointer transition-colors"
							onClick={() => onSelectClient(client.id)}
						>
							<CardHeader>
								<CardTitle className="flex items-center justify-between">
									<div className="flex flex-col gap-1">
										<span className="truncate">{client.name}</span>
										<span className="text-muted-foreground text-xs font-normal">
											{client.email}
										</span>
									</div>
									<div className="flex items-center shrink-0 p-2 border gap-1 bg-background">
										<ConnectionIcon connectionStatus={clientConnectionStatus} />
										<ChevronRight className="h-5 w-5" />
									</div>
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="flex flex-col gap-2 text-xs">
									<div className="flex justify-between">
										<span className="text-muted-foreground">Total:</span>
										<span className="font-semibold">{client.totalBackups}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Unique:</span>
										<span className="font-semibold">
											{client.uniqueBackupNames}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Total Size:</span>
										<span className="font-semibold">
											{formatBytes(client.totalSize)}
										</span>
									</div>
									{client.lastBackupDate && (
										<div className="flex justify-between">
											<span className="text-muted-foreground">
												Last Backup:
											</span>
											<span
												className={`font-semibold ${
													new Date(client.lastBackupDate).getTime() <
													Date.now() - 2 * 24 * 60 * 60 * 1000
														? "text-orange-200"
														: ""
												}`}
											>
												{new Date(client.lastBackupDate).toLocaleString()}
											</span>
										</div>
									)}
									{activeBackup && (
										<div className="mt-2 space-y-1">
											<div className="h-2 bg-background overflow-hidden">
												<div
													className="h-full bg-muted transition-all duration-300"
													style={{ width: `${activeBackup.progress}%` }}
												/>
											</div>
										</div>
									)}
									{/* {!activeBackup && lastError && (
										<div className="flex items-start gap-1.5 text-xs text-destructive mt-1">
											<XCircle className="h-3 w-3 mt-0.5 shrink-0" />
											<span className="truncate">
												Last error: {lastError.backupName}
											</span>
										</div>
									)}
									{!activeBackup && !lastError && lastCompleted && (
										<div className="flex items-center gap-1.5 text-xs text-green-400 mt-1">
											<span className="text-muted-foreground shrink-0">
												Last run:
											</span>
											<span className="truncate font-medium">
												{lastCompleted.backupName} (
												<RelativeDate date={new Date(lastCompleted.date)} />)
											</span>
										</div>
									)} */}
								</div>
							</CardContent>
						</Card>
					);
				})}
			</div>
		</div>
	);
}
