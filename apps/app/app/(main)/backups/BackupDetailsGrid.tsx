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
import type { BackupDetail } from "./types";

interface Props {
	backupDetails: BackupDetail[];
	selectedBackupName: string;
	onBack: () => void;
	clientName: string;
	currentStatus: string | null;
	clientStates: Map<string, any>;
	selectedClient: string;
}

export default function BackupDetailsGrid({
	backupDetails,
	selectedBackupName,
	clientName,
	onBack,
	currentStatus,
	clientStates,
	selectedClient,
}: Props) {
	const wsState = clientStates.get(selectedClient);
	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3 border bg-card p-3">
				<Button variant="outline" size="sm" onClick={onBack}>
					<ChevronDown className="h-4 w-4 rotate-90" />
				</Button>
				<ClientTitle connectionStatus={currentStatus} name={clientName} />
				<h2 className="font-semibold flex items-center gap-2">
					{selectedBackupName} Versions
				</h2>
			</div>
			{wsState?.activeBackup && (
				<div className="w-full border p-3 flex items-center relative bg-background">
					<div
						style={{ zIndex: 1 }}
						className="flex justify-between items-center w-full"
					>
						<div>
							<p className="font-semibold text-sm mb-0.5">
								{wsState?.activeBackup.title}
							</p>
							<p className="text-xs text-muted-foreground">
								{wsState?.activeBackup.description}
							</p>
						</div>
						<div className="flex items-center gap-1.5">
							{wsState?.activeBackup?.progress !== 0 && (
								<p className="text-xs text-muted-foreground">
									{wsState?.activeBackup.progress}%
								</p>
							)}
						</div>
					</div>
					<div
						className={`h-full absolute top-0 left-0 transition-all duration-300 ease-in-out bg-progression`}
						style={{
							width: `${wsState?.activeBackup.progress || 0}%`,
							zIndex: 0,
						}}
					/>
				</div>
			)}
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
