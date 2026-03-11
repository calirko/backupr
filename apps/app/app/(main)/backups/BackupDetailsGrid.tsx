import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import Cookies from "js-cookie";
import { ChevronDown, Clipboard, Download } from "lucide-react";
import { toast } from "sonner";
import { ClientTitle, formatBytes, renderStatusBadge } from "./helpers";
import type { BackupDetail, ClientState } from "./types";

interface Props {
	backupDetails: BackupDetail[];
	selectedBackupName: string;
	onBack: () => void;
	clientName: string;
	selectedClient?: string;
	clientStates: Map<string, ClientState>;
}

export default function BackupDetailsGrid({
	backupDetails,
	selectedBackupName,
	clientName,
	onBack,
	clientStates,
	selectedClient,
}: Props) {
	const wsState = clientStates.get(selectedClient || "");

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3 border bg-card p-3">
				<Button variant="outline" size="sm" onClick={onBack}>
					<ChevronDown className="h-4 w-4 rotate-90" />
				</Button>
				<ClientTitle
					connectionStatus={wsState?.connected || false}
					name={clientName}
				/>
				<h2 className="font-semibold flex items-center gap-2">
					{selectedBackupName} Versions
				</h2>
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{backupDetails.map((backup) => (
					<Card key={backup.id}>
						<CardHeader>
							<CardTitle className="flex items-center justify-between">
								<span>v{backup.version}</span>
								{renderStatusBadge(backup.status)}
							</CardTitle>
							<CardDescription>
								<p>{new Date(backup.createdAt).toLocaleString()}</p>
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex flex-col gap-2 text-xs">
								<div className="flex justify-between">
									<span className="text-muted-foreground">Zip Name:</span>
									<span className="font-semibold">
										{backup.zipName || "N/A"}
									</span>
								</div>
								<div className="flex justify-between">
									<span className="text-muted-foreground">Files:</span>
									<span className="font-semibold">{backup.filesCount}</span>
								</div>
								<div className="flex justify-between">
									<span className="text-muted-foreground">Size:</span>
									<span className="font-semibold">
										{formatBytes(backup.totalSize)}
									</span>
								</div>
							</div>
							{backup.status === "completed" && (
								<div className="flex gap-2">
									<Button
										className="grow"
										onClick={() => {
											const token = Cookies.get("token");
											window.location.href = `/api/backup/${backup.id}/download?apiKey=${token}`;
										}}
									>
										<Download className="h-4 w-4 mr-2" />
										Download
									</Button>
									<Button
										variant={"outline"}
										onClick={() => {
											const url = `${window.location.origin}/api/backup/${backup.id}/download?apiKey=${Cookies.get("token")}`;
											navigator.clipboard.writeText(url);
											toast.success("Link copied to clipboard");
										}}
									>
										<Clipboard />
										Copy Link
									</Button>
								</div>
							)}
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
