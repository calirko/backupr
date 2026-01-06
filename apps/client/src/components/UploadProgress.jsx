import { Pause, Play } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

export function UploadProgress({
	uploadProgress,
	isPaused,
	onPause,
	onResume,
}) {
	if (!uploadProgress.message) return null;

	const getStageLabel = (stage) => {
		switch (stage) {
			case "compressing":
				return "Compressing";
			case "uploading":
				return "Uploading";
			case "preparing":
				return "Preparing";
			default:
				return "";
		}
	};

	return (
		<Card>
			<CardContent className="pt-6">
				<div className="space-y-2">
					<div className="flex justify-between items-center">
						<div className="flex flex-col gap-1">
							<span className="text-sm font-medium">
								{isPaused ? "Paused: " : ""}
								{uploadProgress.message}
							</span>
							{uploadProgress.stage && (
								<span className="text-xs text-muted-foreground">
									Stage: {getStageLabel(uploadProgress.stage)}
								</span>
							)}
						</div>
						<div className="flex items-center gap-2">
							{!isPaused && (
								<Button
									onClick={onPause}
									size="sm"
									variant="outline"
									className="h-7 w-7 p-0"
								>
									<Pause className="h-3 w-3" />
								</Button>
							)}
							{isPaused && (
								<Button
									onClick={onResume}
									size="sm"
									variant="outline"
									className="h-7 w-7 p-0"
								>
									<Play className="h-3 w-3" />
								</Button>
							)}
							<span className="text-sm text-muted-foreground">
								{Math.round(uploadProgress.percent)}%
							</span>
						</div>
					</div>
					<div className="w-full bg-muted-foreground rounded-full h-2">
						<div
							className="bg-primary h-2 rounded-full transition-all duration-300"
							style={{ width: `${uploadProgress.percent}%` }}
						></div>
					</div>
					{uploadProgress.processedFiles !== undefined && (
						<p className="text-xs text-muted-foreground">
							Files: {uploadProgress.processedFiles} /{" "}
							{uploadProgress.totalFiles}
						</p>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
