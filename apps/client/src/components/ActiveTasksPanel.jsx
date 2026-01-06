import { useEffect, useState } from "react";
import {
	AlertCircle,
	CheckCircle,
	Clock,
	Loader2,
	Pause,
	Play,
	X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";

export function ActiveTasksPanel() {
	const [activeTasks, setActiveTasks] = useState([]);
	const [stats, setStats] = useState(null);

	const loadActiveTasks = async () => {
		if (window.electron) {
			const tasks = await window.electron.getActiveTasks();
			const taskStats = await window.electron.getTaskManagerStats();
			setActiveTasks(tasks || []);
			setStats(taskStats);
		}
	};

	useEffect(() => {
		loadActiveTasks();

		// Refresh every 2 seconds
		const interval = setInterval(loadActiveTasks, 2000);

		// Listen for task status updates
		if (window.electron?.onTaskStatusUpdate) {
			window.electron.onTaskStatusUpdate(() => {
				loadActiveTasks();
			});
		}

		return () => clearInterval(interval);
	}, []);

	const handleCancelTask = async (taskId) => {
		if (window.electron) {
			await window.electron.cancelTask(taskId);
			await loadActiveTasks();
		}
	};

	const getStatusIcon = (status) => {
		switch (status) {
			case "running":
				return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
			case "paused":
				return <Pause className="h-4 w-4 text-orange-600" />;
			case "pending":
				return <Clock className="h-4 w-4 text-gray-600" />;
			case "completed":
				return <CheckCircle className="h-4 w-4 text-green-600" />;
			case "failed":
				return <AlertCircle className="h-4 w-4 text-red-600" />;
			default:
				return null;
		}
	};

	const getStatusBadge = (status) => {
		const variants = {
			running: "default",
			paused: "secondary",
			pending: "outline",
			completed: "success",
			failed: "destructive",
		};

		return (
			<Badge variant={variants[status] || "outline"}>
				{status.charAt(0).toUpperCase() + status.slice(1)}
			</Badge>
		);
	};

	if (activeTasks.length === 0) {
		return null;
	}

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex justify-between items-center">
					<CardTitle className="text-lg">Active Backup Tasks</CardTitle>
					{stats && (
						<div className="flex gap-2 text-sm text-muted-foreground">
							<span>Running: {stats.runningTasks}</span>
							<span>Queued: {stats.queuedTasks}</span>
						</div>
					)}
				</div>
			</CardHeader>
			<CardContent className="space-y-2">
				{activeTasks.map((task) => (
					<div
						key={task.id}
						className="border rounded-lg p-3 bg-secondary/30 space-y-2"
					>
						<div className="flex justify-between items-start">
							<div className="flex items-center gap-2">
								{getStatusIcon(task.status)}
								<div>
									<div className="font-medium">{task.itemName}</div>
									<div className="text-xs text-muted-foreground">
										{task.status === "running" && task.message && (
											<span>{task.message}</span>
										)}
										{task.retryCount > 0 && (
											<span className="text-orange-600">
												Retry attempt {task.retryCount}/{task.maxRetries}
											</span>
										)}
									</div>
								</div>
							</div>
							<div className="flex items-center gap-2">
								{getStatusBadge(task.status)}
								{(task.status === "running" || task.status === "paused") && (
									<Button
										variant="ghost"
										size="sm"
										onClick={() => handleCancelTask(task.id)}
										className="h-7 w-7 p-0"
									>
										<X className="h-3 w-3" />
									</Button>
								)}
							</div>
						</div>

						{task.status === "running" && task.progress > 0 && (
							<div className="w-full bg-muted rounded-full h-2">
								<div
									className="bg-primary h-2 rounded-full transition-all duration-300"
									style={{ width: `${task.progress}%` }}
								/>
							</div>
						)}

						{task.error && (
							<div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">
								{task.error}
							</div>
						)}
					</div>
				))}
			</CardContent>
		</Card>
	);
}
